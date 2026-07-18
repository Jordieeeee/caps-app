/**
 * One-time migration: move existing `role: 'Collector'` documents out of the
 * `users` collection into their own `collectors` collection.
 *
 *   node scripts/migrate-collectors-to-own-collection.js
 *
 * Works against the raw collections (not the `User`/`Collector` Mongoose
 * models) so it doesn't depend on old documents matching either model's
 * *current* schema — `User.role` no longer even allows 'Collector' as a
 * value, which is exactly the state this script is migrating away from.
 *
 * `_id` is preserved on every migrated document, same reasoning as
 * migrate-consumers-to-own-collection.js: nothing in this codebase stores an
 * ObjectId ref to a Collector (Collection.collectorId / MeterReading.collectorId
 * are plain strings taken from the JWT `sub` claim, confirmed by inspection),
 * so preserving `_id` isn't strictly load-bearing here the way it was for
 * Consumer — it's kept anyway for consistency and because any already-issued
 * RefreshToken.user value still needs to resolve.
 *
 * NOTE: the live `collectors` collection already existed (created by the
 * separate Admin Portal codebase sharing this database) with a pre-existing
 * unique index on `employeeId` — but it was empty at the time this was
 * written, so there is no pre-existing-data collision to reconcile the way
 * there was for `consumers`. Every Collector document in `users` already has
 * a non-null, unique `employeeId` (from seed/employees.js), so it satisfies
 * that index without modification.
 *
 * Idempotent and resumable: a document is only deleted from `users` after its
 * insert into `collectors` is confirmed (or was already there from a prior,
 * interrupted run).
 *
 * DEVELOPMENT/OPS TOOL, guarded the same way as the Consumer migration:
 * refuses a non-local MONGO_URI without --force, because this one *deletes*
 * production data if pointed at the wrong place by mistake.
 */
require('dotenv').config();

const mongoose = require('mongoose');
const connectDB = require('../config/db');

function assertSafeTarget(uri) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run against NODE_ENV=production without a manual review.');
  }

  const host = (uri.match(/@([^/?]+)/) || uri.match(/mongodb:\/\/([^/?]+)/) || [])[1] || '';
  const isLocal = /^(localhost|127\.0\.0\.1|\[::1\]|host\.docker\.internal)(:\d+)?$/.test(host);

  if (!isLocal && !process.argv.includes('--force')) {
    throw new Error(
      `Refusing to migrate a non-local database.\n\n` +
        `  MONGO_URI points at: ${host}\n\n` +
        `This script deletes documents from 'users' once they're copied to\n` +
        `'collectors'. That's safe to run repeatedly on a database you mean to\n` +
        `migrate, and destructive on one you don't.\n\n` +
        `If you genuinely mean to run this against ${host}, re-run with --force.`
    );
  }
}

async function migrate() {
  const uri = process.env.MONGO_URI;
  if (uri) assertSafeTarget(uri);

  await connectDB(uri);

  const usersCol = mongoose.connection.collection('users');
  const collectorsCol = mongoose.connection.collection('collectors');

  const toMigrate = await usersCol.find({ role: 'Collector' }).toArray();

  if (toMigrate.length === 0) {
    console.log('No role:"Collector" documents found in users — nothing to migrate.');
  }

  let migrated = 0;
  let alreadyDone = 0;

  for (const doc of toMigrate) {
    const existing = await collectorsCol.findOne({ _id: doc._id });

    if (!existing) {
      await collectorsCol.insertOne({
        _id: doc._id,
        name: doc.name,
        email: doc.email,
        passwordHash: doc.passwordHash,
        role: 'Collector',
        status: doc.status,
        routeIds: doc.routeIds || [],
        zone: doc.zone,
        employeeId: doc.employeeId,
        phone: doc.phone,
        dateHired: doc.dateHired,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      });
      migrated += 1;
    } else {
      alreadyDone += 1;
    }

    await usersCol.deleteOne({ _id: doc._id });
    console.log(`migrated  ${doc.email}`);
  }

  const usersRemaining = await usersCol.countDocuments({ role: 'Collector' });
  const collectorsTotal = await collectorsCol.countDocuments();

  console.log(
    `\n${migrated} newly inserted, ${alreadyDone} already present from a prior run.\n` +
      `users collection now has ${usersRemaining} role:"Collector" docs remaining (expect 0).\n` +
      `collectors collection has ${collectorsTotal} total documents.`
  );

  await mongoose.disconnect();
}

migrate()
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error('Migration failed:', err.message);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
