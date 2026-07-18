/**
 * One-time migration: move existing `role: 'Consumer'` documents out of the
 * `users` collection into their own `consumers` collection.
 *
 *   node scripts/migrate-consumers-to-own-collection.js
 *
 * Works against the raw collections (not the `User`/`Consumer` Mongoose
 * models) so it doesn't depend on old documents matching either model's
 * *current* schema — `User.role` no longer even allows 'Consumer' as a value,
 * which is exactly the state this script is migrating away from.
 *
 * `_id` is preserved on every migrated document. That's load-bearing: every
 * existing reference to a consumer (`Account.consumerIds`,
 * `Notification.consumerId`, `Feedback.consumerId`, any already-issued
 * `RefreshToken.user`) is an ObjectId with no idea which collection it
 * resolves against — preserving `_id` means none of those references need to
 * be rewritten, only the code that resolves them (already done in
 * authController.js).
 *
 * Idempotent and resumable: a document is only deleted from `users` after its
 * insert into `consumers` is confirmed (or was already there from a prior,
 * interrupted run) — re-running after a crash mid-migration won't duplicate
 * or lose anything.
 *
 * DEVELOPMENT/OPS TOOL, not a public seed, but still guarded the same way as
 * seed/employees.js and seed/consumers.js: refuses a non-local MONGO_URI
 * without --force, because this one *deletes* production data if pointed at
 * the wrong place by mistake.
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
        `'consumers'. That's safe to run repeatedly on a database you mean to\n` +
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
  const consumersCol = mongoose.connection.collection('consumers');

  const toMigrate = await usersCol.find({ role: 'Consumer' }).toArray();

  if (toMigrate.length === 0) {
    console.log('No role:"Consumer" documents found in users — nothing to migrate.');
  }

  let migrated = 0;
  let alreadyDone = 0;

  for (const doc of toMigrate) {
    const existing = await consumersCol.findOne({ _id: doc._id });

    if (!existing) {
      await consumersCol.insertOne({
        _id: doc._id,
        name: doc.name,
        email: doc.email,
        passwordHash: doc.passwordHash,
        role: 'Consumer',
        status: doc.status,
        accountNumbers: doc.accountNumbers || [],
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      });
      migrated += 1;
    } else {
      // Insert already happened on a prior, interrupted run — just finish the delete.
      alreadyDone += 1;
    }

    await usersCol.deleteOne({ _id: doc._id });
    console.log(`migrated  ${doc.email}`);
  }

  const usersRemaining = await usersCol.countDocuments({ role: 'Consumer' });
  const consumersTotal = await consumersCol.countDocuments();

  console.log(
    `\n${migrated} newly inserted, ${alreadyDone} already present from a prior run.\n` +
      `users collection now has ${usersRemaining} role:"Consumer" docs remaining (expect 0).\n` +
      `consumers collection has ${consumersTotal} total documents.`
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
