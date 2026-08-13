#!/usr/bin/env node
/**
 * Seed three months of meter readings and bills for the district's real consumers.
 *
 * WHY THIS EXISTS
 * The mobile app's "Past 3 months used" module reads `bills.consumptionCuM`. Only
 * one consumer in the database (CON-TEST-0001) has ever been billed, so every real
 * login — the six consumers the portal team created — saw an empty Bills screen and
 * no usage history at all. This gives them one.
 *
 * ⚠️ THIS WRITES TO THE ADMIN PORTAL'S OWN COLLECTIONS. Every other file in this
 * backend treats `bills`, `meterreadings`, `meters` and `serviceconnections` as
 * read-only, and that rule is right: the portal owns billing runs, arrears
 * carry-forward, voiding and penalties. This script is the deliberate exception and
 * it is a script, not an endpoint, so the write is a decision someone makes on
 * purpose at a terminal rather than something the API can be talked into.
 *
 * WHAT IT WRITES, per connection (the full chain, so nothing is left incoherent):
 *   meters               one installed meter, if the connection has none
 *   serviceconnections   status → active, dateConnected, openingReadings[]
 *   meterreadings        one APPROVED reading per period (portal shape, Decimal128)
 *   bills                one bill per period, charges computed from `rateschedules`
 *
 * A bill for a connection that is still `pending_installation` with no meter would
 * be data no billing clerk could explain, which is why activation is included
 * rather than left as "the app looks right".
 *
 * SAFE BY DEFAULT
 *   node scripts/seed-usage-history.js            # dry run: prints the plan, writes nothing
 *   node scripts/seed-usage-history.js --apply    # writes
 *   node scripts/seed-usage-history.js --undo --apply   # removes what it wrote
 *
 * Idempotent: bills key on `billNo` (`BILLSEED-<accountNo>-<YYYYMM>`), readings on
 * connection + period, meters on connection. Running it twice changes nothing the
 * second time. Every figure is deterministic — no Math.random anywhere — so a
 * re-run reproduces the same history rather than quietly rewriting it.
 *
 * NOT PRODUCTION DATA. Every bill is prefixed `BILLSEED-` precisely so it can be
 * found and deleted in one query, and so nobody mistakes it for a board-approved
 * billing run. The rates it charges at are the portal's own `rateschedules`, which
 * carry `notes: "PLACEHOLDER — not a board-approved rate."` — the amounts are
 * therefore consistent with what the portal would compute, and no more real than
 * that.
 */

require('dotenv').config();
const mongoose = require('mongoose');

const APPLY = process.argv.includes('--apply');
const UNDO = process.argv.includes('--undo');

/** The last complete billing period. Fixed, not derived from today: a script whose
 *  output depends on the day it runs cannot be re-run to the same state. */
const LATEST_PERIOD = '2026-07';
const MONTHS = 3;

/** Bills this script owns. The prefix is the undo key — do not reuse it elsewhere. */
const BILL_PREFIX = 'BILLSEED';

/**
 * Consumption per account, in cubic metres, oldest period first.
 *
 * Hand-written rather than generated: these are the numbers a demo will be read
 * from, and they should look like households rather than like a random walk. A
 * Tanauan household on a residential tap runs roughly 15–35 m³ a month; the
 * commercial connection runs higher. One account (0004) is deliberately near the
 * 10 m³ minimum-charge floor so the minimum-charge path gets exercised, and one
 * (0002) rises month on month so the "more than last month" branch of the usage
 * module has real data behind it.
 *
 * Accounts not listed fall back to RESIDENTIAL_DEFAULT.
 */
const CONSUMPTION = {
  'ACC-2026-0001': [22, 26, 19],
  'ACC-2026-0002': [28, 31, 35],
  'ACC-2026-0003': [55, 62, 48],
  'ACC-2026-0004': [9, 12, 8],
  'ACC-2026-0005': [24, 21, 27],
  'ACC-2026-0006': [33, 30, 36],
};
const RESIDENTIAL_DEFAULT = [20, 23, 21];

/** Where each meter's dial started. Deterministic, and different per account so two
 *  households never share a reading sequence. */
function openingIndexFor(accountNo) {
  const tail = Number(accountNo.slice(-4));
  return Number.isFinite(tail) ? 800 + tail * 137 : 1000;
}

/** `2026-07`, 3 → `['2026-05', '2026-06', '2026-07']`. */
function periodsEndingAt(latest, count) {
  const [year, month] = latest.split('-').map(Number);
  const out = [];
  for (let back = count - 1; back >= 0; back -= 1) {
    const d = new Date(Date.UTC(year, month - 1 - back, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

/** Meters are read near the end of the period; bills fall due mid-next-month.
 *  Both mirror the dates on the portal's own test bills. */
function readingDate(period) {
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 28));
}
function dueDate(period) {
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y, m, 12));
}

/**
 * The portal's own tariff, applied the portal's own way.
 *
 * Verified against all three live bills before being written: 50 m³ → ₱1,800,
 * 60 → ₱2,300, 48 → ₱1,700, each matching `charges.basicCharge` exactly. That
 * agreement is the point — a seeded bill that priced water differently from the
 * portal would be discovered later as a "bug" in whichever system was looked at
 * second.
 *
 * `minimumCharge` covers the first `minimumConsumption` m³ whether they are used or
 * not; brackets price the rest. The schedule's `fees` (environmental, VAT) are NOT
 * applied: the live bills do not include them in `charges.totalAmountDue`, and
 * adding them here would make every seeded bill more expensive than a real one.
 */
function basicCharge(consumption, schedule) {
  if (consumption <= schedule.minimumConsumption) return schedule.minimumCharge;

  let total = schedule.minimumCharge;
  let remaining = consumption - schedule.minimumConsumption;

  for (const bracket of schedule.brackets) {
    if (remaining <= 0) break;
    const span = bracket.to === null ? Infinity : bracket.to - bracket.from + 1;
    const take = Math.min(span, remaining);
    total += take * bracket.ratePerCubicMeter;
    remaining -= take;
  }

  return total;
}

const decimal = (n) => mongoose.Types.Decimal128.fromString(Number(n).toFixed(2));

async function main() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not set');
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  const periods = periodsEndingAt(LATEST_PERIOD, MONTHS);

  /**
   * The six the portal created. Scoped by `accountNo` prefix rather than "everything
   * that isn't the test consumer": a script that writes to whatever it finds will
   * one day find production.
   */
  const connections = await db
    .collection('serviceconnections')
    .find({ accountNo: /^ACC-2026-\d{4}$/ })
    .sort({ accountNo: 1 })
    .toArray();

  if (connections.length === 0) throw new Error('No ACC-2026-* service connections found.');

  if (UNDO) return undo(db, connections, periods);

  const schedules = await db.collection('rateschedules').find({}).toArray();
  const byClassification = new Map(schedules.map((s) => [s.classification, s]));

  console.log(`${APPLY ? 'WRITING' : 'DRY RUN — nothing will be written'}`);
  console.log(`Periods: ${periods.join(', ')}\n`);

  for (const connection of connections) {
    const { accountNo, accountType } = connection;
    const consumer = await db.collection('consumers').findOne({ _id: connection.consumerId });

    if (!consumer) {
      console.log(`${accountNo}: SKIPPED — consumerId ${connection.consumerId} resolves to nothing`);
      continue;
    }

    const schedule = byClassification.get(accountType) || byClassification.get('residential');
    if (!schedule) {
      console.log(`${accountNo}: SKIPPED — no rate schedule for '${accountType}'`);
      continue;
    }

    const usage = CONSUMPTION[accountNo] || RESIDENTIAL_DEFAULT;
    const name =
      consumer.businessName ||
      [consumer.firstName, consumer.lastName].filter(Boolean).join(' ') ||
      consumer.consumerNo;

    console.log(`${accountNo} — ${name} (${accountType})`);

    // ── Meter ──────────────────────────────────────────────────────────────────
    // One per connection. A reading needs a meter to have been taken from, and the
    // portal's reading documents carry `meterId`.
    let meter = await db.collection('meters').findOne({ connectionId: connection._id });
    const opening = openingIndexFor(accountNo);

    if (!meter) {
      const meterDoc = {
        serialNo: `MTR-${accountNo.replace('ACC-', '')}`,
        connectionId: connection._id,
        brand: 'Seeded',
        removalDate: null,
        initialReading: decimal(opening),
        status: 'installed',
        // Installed before the first period it is billed for, not on the day this
        // script ran — a meter cannot be read for May if it was fitted in August.
        installDate: readingDate(periods[0]),
        createdAt: new Date(),
        updatedAt: new Date(),
        __v: 0,
      };
      console.log(`  meter    ${meterDoc.serialNo} @ ${opening} (new)`);
      if (APPLY) {
        const { insertedId } = await db.collection('meters').insertOne(meterDoc);
        meter = { ...meterDoc, _id: insertedId };
      } else {
        meter = { ...meterDoc, _id: new mongoose.Types.ObjectId() };
      }
    } else {
      console.log(`  meter    ${meter.serialNo} (exists)`);
    }

    // ── Readings and bills ─────────────────────────────────────────────────────
    let previous = opening;
    const openingReadings = [];

    for (let i = 0; i < periods.length; i += 1) {
      const period = periods[i];
      const consumption = usage[i] ?? RESIDENTIAL_DEFAULT[i];
      const current = previous + consumption;
      const isLatest = i === periods.length - 1;

      openingReadings.push({ period, reading: previous });

      const charge = basicCharge(consumption, schedule);
      const billNo = `${BILL_PREFIX}-${accountNo}-${period.replace('-', '')}`;

      // The reading, in the portal's shape: Decimal128 figures, APPROVED, and
      // upserted on connection+period so a re-run cannot double-read a month.
      const readingFilter = { connectionId: connection._id, period };
      const readingDoc = {
        connectionId: connection._id,
        meterId: meter._id,
        period,
        readingDate: readingDate(period),
        previousReading: decimal(previous),
        currentReading: decimal(current),
        consumptionCuM: decimal(consumption),
        status: 'APPROVED',
        source: 'manual',
        importBatchId: null,
        capturedBy: null,
        approvedBy: null,
        approvedAt: readingDate(period),
        rejectionReason: null,
        isRejected: false,
      };

      let readingId;
      if (APPLY) {
        const res = await db
          .collection('meterreadings')
          .findOneAndUpdate(
            readingFilter,
            { $set: readingDoc, $setOnInsert: { createdAt: new Date(), __v: 0 }, $currentDate: { updatedAt: true } },
            { upsert: true, returnDocument: 'after' }
          );
        readingId = (res.value || res)._id;
      } else {
        const existing = await db.collection('meterreadings').findOne(readingFilter);
        readingId = existing ? existing._id : new mongoose.Types.ObjectId();
      }

      /**
       * The bill.
       *
       * `billingRunId` is null on purpose. The portal's own test bills point at
       * `billingruns` documents that do not exist — that collection is empty — and
       * copying a dangling reference would propagate a bug rather than mirror a
       * shape. Inventing a billing-run document is worse still: nothing in this
       * repo has ever seen one, and guessing at a collection's schema is how the
       * `bills` mismatch this script exists to work around happened in the first
       * place.
       *
       * `consumerSnapshot` is copied, not referenced, because that is what the live
       * bills do — a bill records who it was addressed to at the time it was issued,
       * so a later change of address does not rewrite history.
       *
       * The most recent period is left UNPAID and every earlier one PAID: it gives
       * the app a live balance to show and a payment history behind it, which is the
       * state most consumers are actually in.
       */
      const billDoc = {
        billNo,
        source: 'generated',
        billingRunId: null,
        legacyReference: null,
        connectionId: connection._id,
        consumerId: consumer._id,
        consumerSnapshot: {
          name,
          accountNo,
          address: connection.serviceAddress || null,
          isSeniorCitizen: Boolean(consumer.isSeniorCitizen),
        },
        period,
        readingId,
        previousReading: previous,
        currentReading: current,
        consumptionCuM: consumption,
        rateScheduleId: schedule._id,
        charges: {
          basicCharge: decimal(charge),
          // Zero because none of these consumers is flagged senior in the registry.
          // If one is later, the portal's own discount rate applies — this script
          // does not invent one.
          seniorDiscount: decimal(0),
          arrears: decimal(0),
          totalAmountDue: decimal(charge),
        },
        dueDate: dueDate(period),
        status: isLatest ? 'UNPAID' : 'PAID',
        voidInfo: { voidedBy: null, voidedAt: null, reason: null },
        isVoid: false,
      };

      console.log(
        `  ${period}  ${String(consumption).padStart(3)} m³  ${String(previous).padStart(5)} → ${String(current).padStart(5)}  ₱${charge.toFixed(2).padStart(9)}  ${billDoc.status}`
      );

      if (APPLY) {
        await db.collection('bills').updateOne(
          { billNo },
          { $set: billDoc, $setOnInsert: { createdAt: new Date(), __v: 0 }, $currentDate: { updatedAt: true } },
          { upsert: true }
        );
      }

      previous = current;
    }

    // ── Activate the connection ────────────────────────────────────────────────
    // `openingReadings` mirrors the live active connection exactly: one
    // `{ period, reading }` per billed month, holding the reading the period opened
    // at — the same figure as each bill's `previousReading`.
    const connectionUpdate = {
      status: 'active',
      openingReadings,
      dateConnected: connection.dateConnected || readingDate(periods[0]),
    };
    console.log(
      `  connection status ${connection.status} → active, connected ${connectionUpdate.dateConnected.toISOString().slice(0, 10)}\n`
    );
    if (APPLY) {
      await db
        .collection('serviceconnections')
        .updateOne({ _id: connection._id }, { $set: connectionUpdate, $currentDate: { updatedAt: true } });
    }
  }

  if (!APPLY) console.log('Dry run complete. Re-run with --apply to write.');
}

/**
 * Remove exactly what this script wrote.
 *
 * Bills and meters go by their seed markers; readings go by the connection+period
 * pairs this script manages. Connection status is deliberately NOT reverted — by
 * the time anyone undoes this, the portal team may have activated those connections
 * for real, and putting them back to `pending_installation` would undo their work
 * as well as ours.
 */
async function undo(db, connections, periods) {
  const ids = connections.map((c) => c._id);
  console.log(APPLY ? 'REMOVING seeded data' : 'DRY RUN — nothing will be removed');

  const billFilter = { billNo: new RegExp(`^${BILL_PREFIX}-`) };
  const readingFilter = { connectionId: { $in: ids }, period: { $in: periods } };
  const meterFilter = { connectionId: { $in: ids }, brand: 'Seeded' };

  console.log(`  bills    ${await db.collection('bills').countDocuments(billFilter)}`);
  console.log(`  readings ${await db.collection('meterreadings').countDocuments(readingFilter)}`);
  console.log(`  meters   ${await db.collection('meters').countDocuments(meterFilter)}`);
  console.log('  connections: status left as-is, on purpose (see undo()).');

  if (!APPLY) return console.log('Dry run complete. Re-run with --undo --apply to remove.');

  await db.collection('bills').deleteMany(billFilter);
  await db.collection('meterreadings').deleteMany(readingFilter);
  await db.collection('meters').deleteMany(meterFilter);
  console.log('Removed.');
}

main()
  .then(() => mongoose.disconnect())
  .catch(async (err) => {
    console.error(err);
    await mongoose.disconnect();
    process.exit(1);
  });
