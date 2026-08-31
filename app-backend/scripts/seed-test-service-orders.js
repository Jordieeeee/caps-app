/**
 * Test fixtures for the Reconnections / Disconnections flow.
 *
 * WHY THIS EXISTS: the collector app reads `serviceorders`, and nothing writes it.
 * The Admin Portal carries out reconnections and disconnections by flipping
 * `serviceconnections.status` and logging `connectionstatushistories` — it has never
 * raised a service order — so both lists in the app are empty in the field and the
 * flow cannot be exercised end to end without putting rows in by hand.
 *
 * EVERY ORDER POINTS AT ACC-TEST-0001, the district's own test account, and never at
 * a real household. That is deliberate: a service order names a gate for somebody to
 * walk to, and a plausible test row against a live account is how a collector ends up
 * shutting off a stranger's water. The one order that ever reached this collection by
 * accident — REC-001, for the nonexistent WD-12345 — is still sitting in it.
 *
 * Every clientId is prefixed `TEST-`, which is the whole cleanup contract:
 *
 *     node scripts/seed-test-service-orders.js          # insert
 *     node scripts/seed-test-service-orders.js --clean  # remove, leaves nothing behind
 *
 * The --clean pass deletes ONLY documents whose clientId starts with `TEST-`, so it
 * cannot touch a real order the portal may raise later.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const ServiceOrder = require('../models/ServiceOrder');
const ServiceConnection = require('../models/ServiceConnection');

const TEST_ACCOUNT = 'ACC-TEST-0001';
const PREFIX = 'TEST-';

/**
 * Three orders, chosen to cover the three states a collector can actually meet.
 * A fourth — `completed` — is what the app produces itself when you confirm one of
 * these, so seeding it would only test the seeder.
 */
const ORDERS = [
  {
    clientId: `${PREFIX}REC-01`,
    type: 'reconnection',
    status: 'pending',
    reason: 'Full payment of outstanding balance received at the office',
  },
  {
    clientId: `${PREFIX}DIS-01`,
    type: 'disconnection',
    status: 'pending',
    reason: 'Arrears over 60 days; notice served 2026-08-15',
  },
  {
    // The one a collector must NOT be able to confirm. It should appear under
    // "Cancelled by the office" with no confirm button on the detail screen.
    clientId: `${PREFIX}DIS-02`,
    type: 'disconnection',
    status: 'cancelled',
    reason: 'Arrears cleared after the order was raised — do not disconnect',
  },
];

async function main() {
  const clean = process.argv.includes('--clean');
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`connected to ${mongoose.connection.name}`);

  if (clean) {
    const { deletedCount } = await ServiceOrder.deleteMany({
      clientId: { $regex: `^${PREFIX}` },
    });
    console.log(`removed ${deletedCount} test order(s)`);
    await mongoose.disconnect();
    return;
  }

  const connection = await ServiceConnection.findOne({ accountNo: TEST_ACCOUNT }).lean();
  if (!connection) {
    // Fail rather than fall back to a real account. See the header.
    throw new Error(
      `${TEST_ACCOUNT} has no service connection — refusing to seed against a real household.`
    );
  }

  const address = [
    connection.serviceAddress?.houseStreet,
    connection.serviceAddress?.barangay,
    connection.serviceAddress?.city,
  ]
    .filter(Boolean)
    .join(', ');

  for (const order of ORDERS) {
    await ServiceOrder.findOneAndUpdate(
      { clientId: order.clientId },
      { $set: { ...order, accountNumber: TEST_ACCOUNT, accountAddress: address } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    console.log(`  ${order.clientId.padEnd(12)} ${order.type.padEnd(14)} ${order.status}`);
  }

  console.log(`\nseeded ${ORDERS.length} order(s) against ${TEST_ACCOUNT} (${address})`);
  console.log('remove them with: node scripts/seed-test-service-orders.js --clean');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
