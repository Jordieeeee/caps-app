const Billing = require('../models/Billing');
const MeterReading = require('../models/MeterReading');

/**
 * The most recent reading of a household's meter that has not yet become a bill.
 *
 * ⚠️ THIS IS THE ONLY THING A CONSUMER CAN SEE BETWEEN A VISIT AND A BILLING RUN.
 * Everything the consumer app shows is derived from `bills`, which the Admin
 * Portal's billing run writes at the end of a period — so a meter read on the 4th
 * left no trace anywhere the household could look until the run happened, and the
 * app answered "how much have we used?" with last month's figure for weeks. That
 * is not a display bug; it is the app having nothing else to say. Now it has this.
 *
 * ⚠️ THE CUBIC METRES ARE MEASURED FROM THE LAST BILL, NOT FROM THE LAST READING.
 * This is the whole correctness question of this file, and it got the wrong answer
 * first time round: it published `meterreadings.consumption` verbatim, the figure
 * the collector's handset stamped against whatever it believed the previous
 * reading to be. On ACC-2026-0007 that produced "47 m³ used" under an August bill
 * that closed the meter at 52, while the meter read 150 — the household was shown
 * less than half of what their September bill will charge them for, on the one
 * card in the app that exists to warn them early. Three separate things were wrong
 * with the stamped figure and none of them are rare:
 *
 *   A CORRECTION MEASURES ITSELF AGAINST THE READING IT REPLACES. The 4 Sep
 *   reading supersedes the 1 Sep one and recorded `previousReading: 103` — the
 *   superseded reading's own face value. Its 47 is the gap between a reading that
 *   counts and one that was withdrawn, which is not a quantity of water.
 *
 *   A READING IN AN ALREADY-BILLED PERIOD WAS DROPPED WHOLE. The 31 Aug re-read
 *   took the meter from 52 to 70 after the August bill had closed at 52. Filtering
 *   on `period` threw the document away and its 18 m³ with it, because the label
 *   on the reading said August and August was billed.
 *
 *   ZERO-BASELINE READINGS SURVIVE IN THE DATA. Several rows here carry
 *   `previousReading: 0` and a consumption equal to the whole meter face (see
 *   utils/previousReading.js, which exists because of exactly that defect). Any of
 *   them landing as the newest reading would have published the meter's lifetime
 *   total as one month's usage.
 *
 * Subtracting the last bill's closing reading is immune to all three: it asks what
 * the meter says now against what the household was last charged up to, which is
 * the same subtraction the district's next billing run performs. A superseded
 * reading, a re-read inside a closed period and a bad `previousReading` change
 * none of it.
 *
 * WHAT THIS DELIBERATELY DOES NOT CARRY: an amount. A reading is not a bill. What
 * a household owes depends on the rate schedule in force, arrears carried forward,
 * senior discounts and the district's own voiding — all of which live in the portal
 * and none of which are decided here. Sending a peso figure alongside a reading
 * would put a number on a consumer's screen that the bill then contradicts, and
 * they would have paid attention to the first one. The reading and the cubic metres
 * are facts about their meter; the money is TWD's to state.
 */

/** Decimal128, a plain number, or a numeric string — the portal writes all three. */
function toNumber(value) {
  if (value === null || value === undefined) return null;
  const n = Number(typeof value === 'object' ? value.toString() : value);
  return Number.isFinite(n) ? n : null;
}

/** A Date to `YYYY-MM-DD`, read in UTC. Matches utils/previousReading.js. */
function dateKeyOf(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

/** `YYYY-MM` → the month after it. Billing periods are calendar facts, not instants. */
function nextMonth(period) {
  const [year, month] = String(period).split('-').map(Number);
  if (!year || !month) return null;
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
}

/**
 * The consumer's word for where a reading has got to.
 *
 * `pending` is the honest default and covers a reading nobody has looked at yet.
 * It is not a warning — the great majority of readings are simply waiting for the
 * month to end — but it must not read as "billed", which is why the two are
 * separate values rather than one "recorded".
 */
function stateOf(status) {
  return String(status || '').toUpperCase() === 'APPROVED' ? 'approved' : 'pending';
}

/**
 * Where the household's billed history stops: the closing reading of their most
 * recent non-void bill, and the period it closed.
 *
 * Void bills are excluded rather than ranked below live ones. A voided bill is the
 * district withdrawing a charge, and measuring from a reading it withdrew would
 * quietly reinstate it as the baseline for everything after.
 */
function billedThroughOf(bills) {
  let best = null;
  for (const bill of bills) {
    const closing = toNumber(bill.currentReading);
    if (closing === null || !bill.period) continue;
    if (!best || bill.period > best.period) best = { period: bill.period, closing };
  }
  return best;
}

/**
 * The fallback baseline for a household the portal has never billed.
 *
 * `serviceconnections.openingReadings` is the only source that covers every
 * connection — see utils/previousReading.js on why nothing bills from zero any
 * more. The opening reading for period P is the meter at the START of P, so the
 * latest opening at or before the reading's own period is the closest thing to a
 * billed baseline that exists before the first bill.
 *
 * Null, never 0, when there is nothing. Zero would republish the meter's lifetime
 * total as this month's usage, which is the defect this whole file guards.
 */
function openingBaselineOf(connection, period) {
  let best = null;
  for (const opening of connection.openingReadings || []) {
    if (!opening || !opening.period || opening.period > period) continue;
    const value = toNumber(opening.reading);
    if (value === null) continue;
    if (!best || opening.period > best.period) best = { period: opening.period, closing: value };
  }
  return best;
}

/**
 * @param {Array} connections lean `serviceconnections` documents
 * @returns {Promise<Map<string, {readingDate:string, period:string,
 *   currentReading:number, consumption:number|null, billedThrough:string|null,
 *   state:'pending'|'approved'}>>}
 *   keyed on the connection's id. Absent where there is nothing to say.
 */
async function latestReadingByConnection(connections) {
  if (!Array.isArray(connections) || connections.length === 0) return new Map();

  const connectionIds = connections.map((c) => c._id);
  const accountNumbers = connections.map((c) => c.accountNo).filter(Boolean);
  const connectionByAccount = new Map(
    connections.filter((c) => c.accountNo).map((c) => [c.accountNo, String(c._id)])
  );

  /**
   * `aggregate` for the same reason utils/previousReading.js uses it: the schema
   * describes the app's document shape, and hydrating a portal document would cast
   * its Decimal128 readings through a Number path and drop what the schema does not
   * declare.
   *
   * A superseded reading is excluded here and not merely ranked below the winner. It
   * is the losing half of a correction, and a household that was handed a receipt
   * for it must see the reading that replaced it rather than both.
   */
  const [readings, bills] = await Promise.all([
    MeterReading.aggregate([
      {
        $match: {
          $or: [
            { accountNumber: { $in: accountNumbers } },
            { connectionId: { $in: connectionIds } },
          ],
          isRejected: { $ne: true },
          supersededBy: null,
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
        },
      },
    ]),
    Billing.find({ connectionId: { $in: connectionIds }, isVoid: { $ne: true } })
      .select('connectionId period currentReading')
      .lean(),
  ]);

  /** Where each connection's billed history stops. */
  const billsByConnection = new Map();
  for (const bill of bills) {
    const key = String(bill.connectionId);
    if (!billsByConnection.has(key)) billsByConnection.set(key, []);
    billsByConnection.get(key).push(bill);
  }

  const connectionById = new Map(connections.map((c) => [String(c._id), c]));

  /**
   * The newest surviving reading per connection.
   *
   * Newest by DATE alone — no period filter. A re-read inside a period the
   * district has already billed is still the freshest thing known about that
   * meter, and the subtraction below is what decides whether it has anything to
   * say, rather than the label on the document. See the header.
   */
  const newest = new Map();

  for (const reading of readings) {
    /**
     * The app's own readings resolve through `accountNumber` even now that they
     * also carry a `connectionId`, so a reading synced before that field existed is
     * attributed exactly as one synced after it.
     */
    const key = reading.accountNumber
      ? connectionByAccount.get(reading.accountNumber)
      : reading.connectionId
        ? String(reading.connectionId)
        : null;
    if (!key) continue;

    // The app stamps a local `YYYY-MM-DD`; the portal stores a Date at UTC midnight.
    const readingDate =
      typeof reading.readingDate === 'string'
        ? reading.readingDate
        : dateKeyOf(reading.readingDate);
    if (!readingDate) continue;

    const currentReading = toNumber(reading.currentReading);
    if (currentReading === null) continue;

    const candidate = {
      readingDate,
      period: reading.period || readingDate.slice(0, 7),
      currentReading,
      state: stateOf(reading.status),
    };

    const current = newest.get(key);
    if (!current || candidate.readingDate > current.readingDate) newest.set(key, candidate);
  }

  const best = new Map();

  for (const [key, reading] of newest) {
    const connection = connectionById.get(key);
    if (!connection) continue;

    const billed = billedThroughOf(billsByConnection.get(key) || []);
    const baseline = billed || openingBaselineOf(connection, reading.period);

    /**
     * No baseline at all — no bill, no opening reading. The reading is still worth
     * showing (the household can check the figure against their own dial) but the
     * cubic metres are not knowable, and null is how the client is told to print
     * the card without them. Zero would be a claim that they have used no water.
     */
    const consumption = baseline === null ? null : reading.currentReading - baseline.closing;

    /**
     * Nothing new since the bill — drop the connection entirely.
     *
     * This is what the old `period`-based filter was reaching for and kept missing.
     * A reading equal to the last bill's closing reading IS that bill's reading,
     * and the bill is the better record of the same visit: it carries the amount,
     * the due date and the district's own confirmation, and showing both reads as
     * two separate events at one meter.
     *
     * Negative lands here too, and deliberately. A meter that now reads LESS than
     * the household was billed up to is a replaced unit, a rollover past its
     * digits, or a mis-keyed reading — three situations this endpoint cannot tell
     * apart and none of which it should render. Silence beats "-882 m³ used".
     */
    if (consumption !== null && consumption <= 0) continue;

    /**
     * The period the bill will actually carry, which is not always the label on
     * the reading. A re-read stamped `2026-08` after the August bill has closed
     * will be billed in September, and telling that household "your August 2026
     * bill will follow" points them at a bill they have already received.
     */
    const period =
      billed && nextMonth(billed.period) && nextMonth(billed.period) > reading.period
        ? nextMonth(billed.period)
        : reading.period;

    best.set(key, {
      readingDate: reading.readingDate,
      period,
      currentReading: reading.currentReading,
      consumption,
      /**
       * The bill the cubic metres are measured from, so the card can name it
       * instead of leaving "since then" to point at whatever the reader assumes.
       * Null where the baseline came from an opening reading — there is no bill to
       * name, and inventing one would be worse than the vaguer sentence.
       */
      billedThrough: billed ? billed.period : null,
      state: reading.state,
    });
  }

  return best;
}

module.exports = { latestReadingByConnection };
