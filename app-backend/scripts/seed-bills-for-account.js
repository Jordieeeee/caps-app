/**
 * Seed TEST bills for one account number.
 *
 * ⚠️ WRITES INVENTED BILLING ROWS into `bills`, a collection the Admin Portal
 * owns. This exists so the consumer app can be demonstrated end to end against
 * an account the portal has not billed yet. Every row it writes is tagged
 * `source: 'seed-script'` and carries a `BILLSEED*` billNo so it can be found
 * and removed again — see the --remove flag. Do not leave these in a database
 * anyone will read as real.
 *
 *   node scripts/seed-bills-for-account.js ACC-2026-0007
 *   node scripts/seed-bills-for-account.js ACC-2026-0007 --remove
 *
 * Document shape is copied from a live portal bill (checked 2026-08-26):
 * Decimal128 charges, UPPERCASE status, period "YYYY-MM". Getting those wrong
 * is exactly the class of bug models/Billing.js documents at length.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const { Decimal128, ObjectId } = mongoose.mongo;

const accountNo = process.argv[2];
const remove = process.argv.includes('--remove');

if (!accountNo) {
  console.error('Usage: node scripts/seed-bills-for-account.js <ACCOUNT-NO> [--remove]');
  process.exit(1);
}

/** Marks every row this script creates, so removal is exact. */
const SEED_SOURCE = 'seed-script';

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  const connection = await db.collection('serviceconnections').findOne({ accountNo });
  if (!connection) {
    console.error(`No service connection for ${accountNo}. Nothing to attach bills to.`);
    await mongoose.disconnect();
    process.exit(1);
  }
  const consumerId = connection.consumerId;

  if (remove) {
    const res = await db
      .collection('bills')
      .deleteMany({ consumerId, source: SEED_SOURCE });
    console.log(`Removed ${res.deletedCount} seeded bill(s) for ${accountNo}.`);
    await mongoose.disconnect();
    return;
  }

  const consumer = await db.collection('consumers').findOne({ _id: consumerId });
  const existing = await db
    .collection('bills')
    .countDocuments({ consumerId, source: SEED_SOURCE });
  if (existing > 0) {
    console.log(`${existing} seeded bill(s) already exist for ${accountNo}. Re-run with --remove first.`);
    await mongoose.disconnect();
    return;
  }

  const name =
    consumer?.name ||
    [consumer?.firstName, consumer?.middleName, consumer?.lastName].filter(Boolean).join(' ') ||
    'Consumer';

  const snapshot = {
    name,
    accountNo,
    address: consumer?.mailingAddress ?? null,
    isSeniorCitizen: consumer?.isSeniorCitizen ?? false,
  };

  // Three consecutive periods, oldest paid and the two most recent unpaid, so
  // the app has something to render in every state it distinguishes: a settled
  // bill, an outstanding one, and an overdue one.
  const now = new Date();
  const periods = [
    { period: '2026-06', prev: 300, curr: 342, amount: '512.00', status: 'PAID', due: '2026-07-12' },
    { period: '2026-07', prev: 342, curr: 389, amount: '574.00', status: 'UNPAID', due: '2026-08-12' },
    { period: '2026-08', prev: 389, curr: 430, amount: '498.00', status: 'UNPAID', due: '2026-09-12' },
  ];

  const docs = periods.map((p) => ({
    _id: new ObjectId(),
    billNo: `BILLSEED${p.period.replace('-', '')}`,
    source: SEED_SOURCE,
    billingRunId: null,
    legacyReference: null,
    connectionId: connection._id,
    consumerId,
    consumerSnapshot: snapshot,
    period: p.period,
    readingId: null,
    previousReading: p.prev,
    currentReading: p.curr,
    consumptionCuM: p.curr - p.prev,
    rateScheduleId: null,
    charges: {
      basicCharge: Decimal128.fromString(p.amount),
      seniorDiscount: Decimal128.fromString('0.00'),
      arrears: Decimal128.fromString('0.00'),
      totalAmountDue: Decimal128.fromString(p.amount),
    },
    dueDate: new Date(`${p.due}T00:00:00.000Z`),
    status: p.status,
    voidInfo: { voidedBy: null, voidedAt: null, reason: null },
    isVoid: false,
    createdAt: now,
    updatedAt: now,
    __v: 0,
  }));

  await db.collection('bills').insertMany(docs);
  console.log(`Seeded ${docs.length} bill(s) for ${accountNo} (consumer ${consumerId}):`);
  for (const d of docs) console.log(`  ${d.period}  ${d.status.padEnd(6)} PHP ${d.charges.totalAmountDue}`);
  console.log('\nRemove them again with: node scripts/seed-bills-for-account.js ' + accountNo + ' --remove');

  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
