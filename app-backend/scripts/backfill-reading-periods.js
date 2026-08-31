/**
 * Backfill `period` on existing meter readings and resolve duplicate meter-months.
 *
 * WHY: a re-read of a meter used to arrive as a second reading rather than a
 * correction, because the phone generates a fresh clientId per record and sync is
 * idempotent on that id alone. The district's collection therefore holds several
 * readings for one meter in one month — thirty-four app readings resolving to twelve
 * account-periods when this was written, one of them with five — and each one is a
 * separately billable invoice.
 *
 * The fix in models/MeterReading.js only engages for readings that carry a `period`,
 * which nothing written before it does. This sets that field from `readingDate`, then
 * runs the same `resolvePeriod` the sync endpoint runs, so history converges on the
 * same rule as new work: the reading the collector took LAST stands, the rest are
 * marked `supersededBy` and excluded from reads.
 *
 * NOTHING IS DELETED. A superseded reading is the one a consumer may have been handed
 * a receipt for, so it stays queryable — `listByFilter` hides it, an explicit
 * `supersededBy` filter finds it.
 *
 *     node scripts/backfill-reading-periods.js --dry-run   # report only
 *     node scripts/backfill-reading-periods.js             # apply
 */
require('dotenv').config();
const mongoose = require('mongoose');
const MeterReading = require('../models/MeterReading');

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`connected to ${mongoose.connection.name}${dryRun ? '  (DRY RUN)' : ''}\n`);

  // Only the app's own documents. The portal's readings key on connectionId, carry
  // their own `period`, and are governed by its review workflow — not this rule.
  const readings = await MeterReading.find({ accountNumber: { $exists: true, $ne: null } })
    .select('clientId accountNumber readingDate period clientTimestamp createdAt currentReading')
    .lean();

  let stamped = 0;
  for (const reading of readings) {
    const period = MeterReading.periodOf(reading.readingDate);
    if (!period || reading.period === period) continue;
    if (!dryRun) await MeterReading.updateOne({ _id: reading._id }, { $set: { period } });
    stamped++;
  }
  console.log(`period stamped on ${stamped} reading(s)`);

  const groups = new Map();
  for (const reading of readings) {
    const period = MeterReading.periodOf(reading.readingDate);
    if (!period) continue;
    const key = `${reading.accountNumber}|${period}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(reading);
  }

  const contested = [...groups.entries()].filter(([, rows]) => rows.length > 1);
  console.log(`${groups.size} account-period(s), ${contested.length} with more than one reading\n`);

  for (const [key, rows] of contested) {
    const [accountNumber, period] = key.split('|');
    if (dryRun) {
      // Mirror resolvePeriod's rule without writing, so the report is the truth.
      const winner = [...rows].sort(
        (a, b) =>
          (b.clientTimestamp || 0) - (a.clientTimestamp || 0) ||
          new Date(b.createdAt || 0) - new Date(a.createdAt || 0) ||
          String(b.clientId).localeCompare(String(a.clientId))
      )[0];
      console.log(
        `  ${key.padEnd(24)} ${rows.length} readings -> keeps ${winner.currentReading} ` +
          `(${winner.readingDate}), supersedes ${rows.length - 1}`
      );
      continue;
    }
    const winner = await MeterReading.resolvePeriod(accountNumber, period);
    console.log(
      `  ${key.padEnd(24)} ${rows.length} readings -> keeps ${winner.currentReading} (${winner.readingDate})`
    );
  }

  const superseded = dryRun ? 0 : await MeterReading.countDocuments({ supersededBy: { $ne: null } });
  console.log(
    dryRun
      ? '\ndry run — nothing written. Re-run without --dry-run to apply.'
      : `\n${superseded} reading(s) now marked superseded; none deleted.`
  );
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
