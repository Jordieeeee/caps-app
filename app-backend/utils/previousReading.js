const Billing = require('../models/Billing');
const MeterReading = require('../models/MeterReading');

/**
 * The reading a new meter reading must be measured against, per account.
 *
 * ⚠️ THIS EXISTED AS `lastReadingByAccount`, WHICH COULD ONLY SEE A QUARTER OF THE
 * DISTRICT'S READINGS. It grouped `meterreadings` by `$accountNumber` — and
 * `meterreadings` holds two entirely different document shapes:
 *
 *   app     clientId, accountNumber, readingDate "2026-08-14", currentReading 25
 *   portal  connectionId, meterId, period "2026-06", readingDate Date,
 *           currentReading Decimal128, status "APPROVED", isRejected
 *
 * The portal's documents carry no `accountNumber` at all, so all 22 of them
 * collapsed into a single `_id: null` bucket and were discarded. Twenty of the
 * district's twenty-eight stops therefore reached the collector's phone with
 * `previousReading: 0` while the portal held a real reading for every one of them.
 * Zero is not a measurement, and billing a first reading of 944 against it charges
 * the household for every cubic metre the meter has ever turned.
 *
 * So this reads all four places a reading is recorded and takes the most recent:
 *
 *   app      a reading this app filed, keyed on accountNumber
 *   portal   an APPROVED reading in the portal's own shape, keyed on connectionId
 *   bill     the closing reading of a non-void bill
 *   opening  serviceconnections.openingReadings — the only source that covers
 *            every connection, and the reason no stop bills from zero any more
 *
 * Recency is compared on a single `at` key, which is what makes four sources with
 * three different notions of "when" comparable at all. A reading carries its own
 * date. A period-based figure is dated to the day it was taken: `openingReadings`
 * for 2026-07 is the meter at the START of July, so it dates to 2026-07-01, while a
 * bill for 2026-05 closes at the END of May and dates to 2026-06-01. That is not a
 * convention invented here — it is why the two agree in the live data: the opening
 * reading for 2026-06 and the closing reading of the 2026-05 bill are both 959.
 */

/** Newest wins; on an identical date, the more specific source does. */
const RANK = { opening: 1, bill: 2, portal: 3, app: 4 };

/** Decimal128, a plain number, or a numeric string — all arrive here. */
function toNumber(value) {
  if (value === null || value === undefined) return null;
  const n = Number(typeof value === 'object' ? value.toString() : value);
  return Number.isFinite(n) ? n : null;
}

/** `YYYY-MM` → the month after it. Reading dates are calendar facts, not instants. */
function nextMonth(period) {
  const [year, month] = String(period).split('-').map(Number);
  if (!year || !month) return null;
  return month === 12
    ? `${year + 1}-01`
    : `${year}-${String(month + 1).padStart(2, '0')}`;
}

/**
 * A Date to `YYYY-MM-DD`, read in UTC.
 *
 * UTC on purpose, matching utils/address.js and the app's own formatDate: the
 * portal stores a reading date as midnight UTC because it is a day the district
 * recorded, not a moment. Reading it locally would move a 2026-06-28 reading to the
 * 27th for anyone west of Greenwich.
 */
function dateKeyOf(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function pick(current, candidate) {
  if (!candidate || candidate.value === null || !candidate.at) return current;
  if (!current) return candidate;
  if (candidate.at !== current.at) return candidate.at > current.at ? candidate : current;
  return RANK[candidate.source] > RANK[current.source] ? candidate : current;
}

/**
 * @param {Array} connections lean `serviceconnections` documents
 * @returns {Promise<Map<string, {value:number, at:string, period:string,
 *   source:'app'|'portal'|'bill'|'opening', readingDate:string|null}>>} keyed on accountNo
 */
async function previousReadingByAccount(connections) {
  const accountByConnection = new Map(
    connections.map((c) => [String(c._id), c.accountNo]).filter(([, no]) => no)
  );
  const accountNumbers = [...new Set(connections.map((c) => c.accountNo).filter(Boolean))];
  const connectionIds = connections.map((c) => c._id);

  if (accountNumbers.length === 0) return new Map();

  /**
   * `aggregate`, not `find`. The MeterReading schema describes the app's shape
   * only, so hydrating a portal document would cast its Decimal128 readings
   * through a Number path and drop every field the schema does not declare.
   * Aggregation returns the raw documents and the mapping below is explicit about
   * which shape it is looking at.
   */
  const [readings, bills] = await Promise.all([
    MeterReading.aggregate([
      {
        $match: {
          $or: [
            { accountNumber: { $in: accountNumbers } },
            { connectionId: { $in: connectionIds } },
          ],
        },
      },
      {
        $project: {
          accountNumber: 1,
          connectionId: 1,
          readingDate: 1,
          currentReading: 1,
          period: 1,
          status: 1,
          isRejected: 1,
        },
      },
    ]),
    Billing.find({ connectionId: { $in: connectionIds }, isVoid: { $ne: true } })
      .select('connectionId period currentReading')
      .lean(),
  ]);

  const best = new Map();
  const offer = (accountNo, candidate) => {
    if (!accountNo) return;
    best.set(accountNo, pick(best.get(accountNo), candidate));
  };

  for (const reading of readings) {
    const value = toNumber(reading.currentReading);

    if (reading.accountNumber) {
      // App shape: readingDate is already the local `YYYY-MM-DD` the collector
      // stamped it with (see the app's localDateKey), so it is used verbatim.
      const at =
        typeof reading.readingDate === 'string'
          ? reading.readingDate
          : dateKeyOf(reading.readingDate);
      offer(reading.accountNumber, {
        value,
        at,
        period: at ? at.slice(0, 7) : null,
        source: 'app',
        readingDate: at,
      });
      continue;
    }

    /**
     * Portal shape. Only APPROVED, never rejected — the portal's reading queue is
     * a review workflow, and a reading somebody rejected is not a fact about the
     * meter. Nothing filtered on this before because nothing could see these
     * documents at all.
     */
    if (reading.isRejected === true || reading.status !== 'APPROVED') continue;
    const at = dateKeyOf(reading.readingDate) || (reading.period ? `${reading.period}-01` : null);
    offer(accountByConnection.get(String(reading.connectionId)), {
      value,
      at,
      period: reading.period || (at ? at.slice(0, 7) : null),
      source: 'portal',
      readingDate: dateKeyOf(reading.readingDate),
    });
  }

  for (const bill of bills) {
    // A bill's currentReading closes its period, so it was taken at the turn of
    // the following month. See the header note on why this matches openingReadings.
    const after = bill.period ? nextMonth(bill.period) : null;
    offer(accountByConnection.get(String(bill.connectionId)), {
      value: toNumber(bill.currentReading),
      at: after ? `${after}-01` : null,
      period: bill.period || null,
      source: 'bill',
      readingDate: null,
    });
  }

  for (const connection of connections) {
    for (const opening of connection.openingReadings || []) {
      if (!opening || !opening.period) continue;
      offer(connection.accountNo, {
        value: toNumber(opening.reading),
        at: `${opening.period}-01`,
        // The opening of a period is the close of the one before it.
        period: previousMonth(opening.period),
        source: 'opening',
        readingDate: null,
      });
    }
  }

  return best;
}

/** `YYYY-MM` → the month before it. */
function previousMonth(period) {
  const [year, month] = String(period).split('-').map(Number);
  if (!year || !month) return null;
  return month === 1
    ? `${year - 1}-12`
    : `${year}-${String(month - 1).padStart(2, '0')}`;
}

module.exports = { previousReadingByAccount };
