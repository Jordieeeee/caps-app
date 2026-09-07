/**
 * Issue the September 2026 bill for ACC-2026-0007 that the Admin Portal has not run.
 *
 * WHY: the meter at ACC-2026-0007 was read on 2026-09-04 at 150, against an August
 * bill that closed it at 52 — 98 m³ the household can see on their phone and cannot
 * yet pay, because the portal's billing run for the period has not happened. This
 * writes the bill that run would have written, so Total due on the consumer app
 * covers the period.
 *
 *     node scripts/seed-september-bill.js --dry-run   # print the document, write nothing
 *     node scripts/seed-september-bill.js             # insert it
 *     node scripts/seed-september-bill.js --undo      # delete it again
 *
 * ⚠️ THIS WRITES TO `bills`, WHICH THIS BACKEND OTHERWISE ONLY READS. models/Billing.js
 * says at length that writes stay with the portal, because the portal owns arrears
 * carry-forward, voiding and the penalty run. That is still the rule; this is a seed
 * script standing in for a billing run on test data, which is what `seed-bills-for-
 * account.js` next door already does. It is not a licence for request-path code to
 * start writing bills.
 *
 * EVERY FIGURE IS DERIVED, NOT TYPED IN. The amount comes from the district's own
 * `rateschedules` document, the baseline from the August bill's closing reading, and
 * the bill number from the same Luhn checksum the portal's own numbers carry — each
 * one asserted against data the portal wrote before anything is inserted. A seed
 * script that hardcodes a peso figure is how test data starts disagreeing with the
 * rate table it is supposed to exercise.
 */
require('dotenv').config();
const mongoose = require('mongoose');

const { Decimal128, ObjectId } = mongoose.mongo;

const ACCOUNT_NO = 'ACC-2026-0007';
const PERIOD = '2026-09';
/** The 2026-09-04 reading (clientId rdg-mtmid3na-9ggheg7o-001) this bill charges for. */
const READING_ID = '6a9a55cb3ef6b109c0a96352';
const CURRENT_READING = 150;
/**
 * The 7th of the month after the period — the district's fixed due day.
 *
 * Was the 14th, copied from the August bill. The cycle is a published calendar
 * day now (see app-frontend/src/shared/utils/billing-cycle.ts): meters are read
 * on the 22nd, and what they bill is payable on the 7th of the month after. A
 * seeded bill on any other day would put the app's schedule marks and its own
 * test data in disagreement.
 */
const DUE_DATE = new Date('2026-10-07T00:00:00.000Z');

/**
 * The check digit the portal's bill numbers carry: Luhn over the digits of
 * `BILL-YYYY-MM-NNNNNN`.
 *
 * Reverse-engineered from the numbers already in the collection and asserted against
 * three of them below before use. A made-up digit would produce a bill number the
 * portal's own validation may reject, on a document that otherwise looks native.
 */
function checkDigit(payload) {
  const digits = payload.split('').reverse().map(Number);
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    if (i % 2 === 0) {
      const doubled = digits[i] * 2;
      sum += doubled > 9 ? doubled - 9 : doubled;
    } else {
      sum += digits[i];
    }
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * Basic charge for a consumption, per a `rateschedules` document.
 *
 * `minimumCharge` buys the first `minimumConsumption` cubic metres outright; each
 * bracket then charges its own rate for the metres inside it, inclusive of `from`
 * and `to`. Verified against the portal's own output at 7 m³ (₱200.00, the August
 * bill for ACC-2026-0008) and at 47 m³ (₱1,650.00, the figure quoted in
 * models/RateSchedule.js) before this is trusted with a new number.
 */
function basicChargeFor(schedule, cubicMetres) {
  let total = schedule.minimumCharge;
  if (cubicMetres <= schedule.minimumConsumption) return total;

  for (const bracket of schedule.brackets) {
    if (cubicMetres < bracket.from) continue;
    const to = bracket.to ?? Infinity;
    total += (Math.min(cubicMetres, to) - bracket.from + 1) * bracket.ratePerCubicMeter;
  }
  return total;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const undo = process.argv.includes('--undo');

  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  console.log(`connected to ${mongoose.connection.name}${dryRun ? '  (DRY RUN)' : ''}\n`);

  const connection = await db.collection('serviceconnections').findOne({ accountNo: ACCOUNT_NO });
  if (!connection) throw new Error(`no service connection for ${ACCOUNT_NO}`);

  if (undo) {
    const { deletedCount } = await db
      .collection('bills')
      .deleteOne({ connectionId: connection._id, period: PERIOD, source: 'seed-script' });
    console.log(deletedCount ? `deleted the ${PERIOD} seed bill for ${ACCOUNT_NO}` : 'nothing to delete');
    return;
  }

  // --- assertions against data the portal wrote, before anything is derived from it

  for (const [number, expected] of [
    ['BILL-2026-08-000001', 4],
    ['BILL-2026-08-000002', 2],
    ['BILL-2026-05-000005', 1],
  ]) {
    const got = checkDigit(number.slice('BILL-'.length).replace(/-/g, ''));
    if (got !== expected) {
      throw new Error(`billNo checksum is not Luhn: ${number} → ${got}, portal wrote ${expected}`);
    }
  }

  const residential = await db.collection('rateschedules').findOne({ classification: 'residential' });
  if (!residential) throw new Error('no residential rate schedule in force');
  if (basicChargeFor(residential, 7) !== 200) throw new Error('rate maths disagrees with the portal at 7 m³');
  if (basicChargeFor(residential, 47) !== 1650) throw new Error('rate maths disagrees with the portal at 47 m³');

  const august = await db
    .collection('bills')
    .findOne({ connectionId: connection._id, period: '2026-08', isVoid: { $ne: true } });
  if (!august) throw new Error(`no live 2026-08 bill for ${ACCOUNT_NO} to measure from`);

  if (await db.collection('bills').countDocuments({ connectionId: connection._id, period: PERIOD })) {
    throw new Error(`a ${PERIOD} bill already exists for ${ACCOUNT_NO} — refusing to add a second`);
  }

  // --- the bill

  const previousReading = Number(august.currentReading);
  const consumptionCuM = CURRENT_READING - previousReading;
  const basicCharge = basicChargeFor(residential, consumptionCuM);

  const bill = {
    billNo: `BILL-2026-09-000001-${checkDigit('202609000001')}`,
    /**
     * `seed-script`, not `generated`, and `billingRunId: null` to match. No billing
     * run produced this document; claiming one would put a reference to a run that
     * does not exist into the district's audit trail, and `--undo` above finds this
     * bill by exactly this field.
     */
    source: 'seed-script',
    billingRunId: null,
    legacyReference: null,
    connectionId: connection._id,
    consumerId: august.consumerId,
    // Copied from the August bill rather than rebuilt from `consumers`: a snapshot is
    // meant to record what the household looked like when billed, and two bills a
    // month apart disagreeing about the name would be a defect, not a detail.
    consumerSnapshot: august.consumerSnapshot,
    period: PERIOD,
    readingId: new ObjectId(READING_ID),
    previousReading,
    currentReading: CURRENT_READING,
    consumptionCuM,
    rateScheduleId: residential._id,
    charges: {
      basicCharge: Decimal128.fromString(basicCharge.toFixed(2)),
      seniorDiscount: Decimal128.fromString('0.00'),
      /**
       * 0.00, NOT August's unpaid ₱200.
       *
       * The consumer app's Total due is the sum of every unpaid bill (see
       * consumer/lib/bill-summary.ts), so an arrears line carrying August forward
       * would count that ₱200 twice — once on its own bill and once inside this one
       * — and hand the household a figure ₱200 higher than they owe on the screen
       * they read before walking to the payment counter.
       */
      arrears: Decimal128.fromString('0.00'),
      totalAmountDue: Decimal128.fromString(basicCharge.toFixed(2)),
    },
    dueDate: DUE_DATE,
    status: 'UNPAID',
    voidInfo: { voidedBy: null, voidedAt: null, reason: null },
    isVoid: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    __v: 0,
  };

  console.log(`${ACCOUNT_NO}  ${PERIOD}  ${bill.billNo}`);
  console.log(`  meter ${previousReading} → ${CURRENT_READING} = ${consumptionCuM} m³`);
  console.log(`  basic charge   ₱${basicCharge.toFixed(2)}   (${residential.minimumCharge} minimum + brackets)`);
  console.log(`  total due      ₱${basicCharge.toFixed(2)}   due ${DUE_DATE.toISOString().slice(0, 10)}`);

  if (dryRun) {
    console.log('\nDRY RUN — nothing written.');
    return;
  }

  const { insertedId } = await db.collection('bills').insertOne(bill);
  console.log(`\ninserted bills/${insertedId}`);
  console.log('undo with:  node scripts/seed-september-bill.js --undo');
}

main()
  .catch((error) => {
    console.error(`\n${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
