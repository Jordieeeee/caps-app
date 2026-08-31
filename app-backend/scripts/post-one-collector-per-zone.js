/**
 * Enforce the district's rule — ONE COLLECTOR PER ZONE — using the collectors that
 * already exist. Creates nobody, deletes nothing.
 *
 * A collector's assigned route IS their zone: GET /accounts/route filters
 * connections on it (utils/collectorZones.js). Today every zone carries five to
 * nine collectors, so nine people are each handed the same eight households and
 * nothing in the district records who actually walks them.
 *
 * This keeps exactly one current assignment per zone and moves the rest to
 * `status: 'ended'` with an `endDate`. Ended, not deleted, for the same reason a
 * superseded meter reading is kept: the posting happened, somebody may have worked
 * it, and the district's own history should still say so.
 *
 * WHO IS KEPT, in order:
 *   1. a collector who can actually sign in (has an email on their person record) —
 *      most of this district's 56 collectors have only a mobile number and no login
 *      at all, and posting one of those to the only zone with a working demo would
 *      leave nobody able to open the route
 *   2. otherwise the longest-serving posting on that zone, by assignedDate
 *
 * ⚠️ WRITES TO THE ADMIN PORTAL'S REGISTRY. `zoneassignments` is the portal's, and
 * the models in this repo are read-only against it by design, so this goes through
 * the raw driver deliberately rather than by accident. It backs the collection up
 * first:
 *
 *     node scripts/post-one-collector-per-zone.js --dry-run
 *     node scripts/post-one-collector-per-zone.js --yes
 *     node scripts/post-one-collector-per-zone.js --restore <backup.json>
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const BACKUP_DIR = path.join(__dirname, '..', '.backups');

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const restoreAt = args.indexOf('--restore');

  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  console.log(`database: ${mongoose.connection.name}${dryRun ? '   (DRY RUN — nothing is written)' : ''}\n`);

  const assignments = db.collection('zoneassignments');

  // ---- restore -------------------------------------------------------------
  if (restoreAt !== -1) {
    const file = args[restoreAt + 1];
    if (!file) throw new Error('--restore needs a backup file path');
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const row of saved) {
      await assignments.updateOne(
        { _id: new mongoose.Types.ObjectId(row._id) },
        { $set: { status: row.status, endDate: row.endDate ? new Date(row.endDate) : null } }
      );
    }
    console.log(`restored ${saved.length} assignment(s) from ${file}`);
    await mongoose.disconnect();
    return;
  }

  const [zones, current, employments, people] = await Promise.all([
    db.collection('zones').find({}).toArray(),
    assignments.find({ status: 'current' }).toArray(),
    db.collection('employments').find({}).toArray(),
    db.collection('collectorpersons').find({}).toArray(),
  ]);

  const personById = new Map(people.map((p) => [String(p._id), p]));
  const employmentById = new Map(employments.map((e) => [String(e._id), e]));
  const describe = (employmentId) => {
    const employment = employmentById.get(String(employmentId));
    const person = employment ? personById.get(String(employment.personId)) : null;
    const name = person
      ? [person.firstName, person.middleName, person.lastName].filter(Boolean).join(' ')
      : String(employmentId);
    return { name, email: person && person.email ? person.email : null };
  };

  const byZone = new Map();
  for (const a of current) {
    const key = String(a.zoneId);
    if (!byZone.has(key)) byZone.set(key, []);
    byZone.get(key).push(a);
  }

  const keep = [];
  const end = [];

  for (const zone of zones) {
    const label = zone.zoneName || zone.zoneCode || String(zone._id);
    const posted = byZone.get(String(zone._id)) || [];
    if (posted.length === 0) {
      console.log(`  ${label.padEnd(10)} no collector posted — left alone, nobody to choose from`);
      continue;
    }

    // A collector who can sign in wins; otherwise the longest-serving posting.
    const ranked = [...posted].sort((a, b) => {
      const ea = describe(a.employmentId).email ? 0 : 1;
      const eb = describe(b.employmentId).email ? 0 : 1;
      if (ea !== eb) return ea - eb;
      return new Date(a.assignedDate || 0) - new Date(b.assignedDate || 0);
    });

    const [winner, ...rest] = ranked;
    const who = describe(winner.employmentId);
    keep.push(winner);
    end.push(...rest);

    console.log(
      `  ${label.padEnd(10)} keep ${who.name}${who.email ? ` <${who.email}>` : ' (no login)'}` +
        `${rest.length ? `  · ending ${rest.length}` : ''}`
    );
  }

  console.log(`\n  zones with a single collector after this: ${keep.length}`);
  console.log(`  assignments to end: ${end.length}`);

  if (dryRun) {
    console.log('\ndry run — nothing written. Re-run with --yes to apply.');
    await mongoose.disconnect();
    return;
  }

  if (!args.includes('--yes')) {
    console.log('\nRefusing to write without --yes.');
    await mongoose.disconnect();
    process.exitCode = 1;
    return;
  }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = path.join(BACKUP_DIR, `zoneassignments-${stamp}.json`);
  fs.writeFileSync(
    backup,
    JSON.stringify(
      current.map((a) => ({ _id: String(a._id), status: a.status, endDate: a.endDate ?? null })),
      null,
      1
    )
  );
  console.log(`\nbacked up ${current.length} assignment(s) -> ${backup}`);

  if (end.length > 0) {
    await assignments.updateMany(
      { _id: { $in: end.map((a) => a._id) } },
      { $set: { status: 'ended', endDate: new Date() } }
    );
  }
  console.log(`ended ${end.length} assignment(s); ${keep.length} zone(s) now have exactly one collector.`);
  console.log(`undo with: node scripts/post-one-collector-per-zone.js --restore ${backup}`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
