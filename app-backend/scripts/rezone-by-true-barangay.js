/**
 * Put every household back in ITS OWN barangay, then zone from there.
 *
 * ⚠️ THIS UNDOES A DELIBERATE INACCURACY. `restructure-barangay-zones.js
 * --concentrate` moved all 116 households into four barangays so that 24 zones each
 * held 4–5 stops — a believable round. The cost was that it REWROTE
 * `serviceAddress.barangay`: a household the registry places in Altura-South started
 * reading "12 Bonifacio St., Boot". Names, account numbers and street lines stayed
 * the district's; the barangay did not. Cross-check the app against
 * twd-admin.consumers and the difference shows up immediately, which is exactly what
 * happened.
 *
 * So this script restores the true address and zones from what is actually there:
 *
 *   1. Recover each household's original `serviceAddress` from the backups written
 *      before the concentration. Two are needed — the first run's backup holds the
 *      original 106, and the second's holds the 10 the portal added afterwards, so
 *      the true value is whichever copy still has no `purok` stamped on it.
 *   2. Create zones per barangay, numbered as puroks, using the district's own purok
 *      counts. A barangay only gets as many zones as it has households to fill, at
 *      roughly TARGET_ROUND per zone — never more than the purok count it really
 *      has. Three households in Altura-South become one zone of three, not three
 *      zones of one.
 *   3. One collector per zone, collectors who can actually sign in first.
 *   4. Retire every zone this script does not own.
 *
 * The trade this makes, stated plainly: rounds get smaller (about 2–3 stops instead
 * of 4–5) because the district's 116 households genuinely are spread across fifty
 * barangays. That is what the registry says, and a round that matches the registry
 * is worth more than a tidier one that does not.
 *
 *     node scripts/rezone-by-true-barangay.js --dry-run
 *     node scripts/rezone-by-true-barangay.js --yes
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const BACKUP_DIR = path.join(__dirname, '..', '.backups');

/** Roughly how many households make a round worth walking. */
const TARGET_ROUND = 4;

/** Purok counts per barangay, from the district's own breakdown. */
const PUROKS = {
  'Poblacion 1':3,'Poblacion 2':3,'Poblacion 3':3,'Poblacion 4':3,'Poblacion 5':4,
  'Poblacion 6':3,'Poblacion 7':4,
  'Altura Bata':4,'Altura Matanda':4,'Altura South':4,'Bagumbayan':5,'Bilog-bilog':4,
  'Gonzales':4,'Hidalgo':4,'Laurel':5,'Luyos':4,'Mabini':4,'Maria Paz':4,'Maugat':5,
  'Montaña':3,'Pantay Bata':4,'Pantay Matanda':5,'Sala':5,'San Jose':4,'Santol':3,
  'Santor':5,'Sulpoc':4,'Suplang':4,'Wawa':5,
  'Ambulong':7,'Bagbag':6,'Banadero':7,'Banjo East':6,'Banjo Laurel':6,'Boot':7,
  'Cale':7,'Janopol Occidental':6,'Janopol Oriental':6,'Malaking Pulo':6,'Natatas':7,
  'Pagaspas':7,'Sambat':7,'Tinurik':7,'Ulango':6,
  'Trapiche':8,'Balele':9,'Darasa':9,'Talaga':9,
};

/** Spellings seen on households → the official name. The last two are defaults. */
const ALIASES = {
  'bañadero':'Banadero','banadero':'Banadero',
  'altura-south':'Altura South','alturasouth':'Altura South',
  'banjo laurel (banjo west)':'Banjo Laurel',
  'poblacion barangay 1':'Poblacion 1','poblacion barangay 2':'Poblacion 2',
  'poblacion barangay 3':'Poblacion 3','poblacion barangay 4':'Poblacion 4',
  'poblacion barangay 5':'Poblacion 5','poblacion barangay 6':'Poblacion 6',
  'poblacion barangay 7':'Poblacion 7',
  'poblacion':'Poblacion 1',
  'janopol':'Janopol Oriental',
};

const key = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const officialByKey = new Map(Object.keys(PUROKS).map((b) => [key(b), b]));

function officialBarangay(raw) {
  const k = key(raw);
  if (ALIASES[k]) return ALIASES[k];
  const direct = officialByKey.get(k);
  if (direct) return direct;
  const squashed = k.replace(/[^a-z0-9]/g, '');
  for (const [ok, name] of officialByKey) {
    if (ok.replace(/[^a-z0-9]/g, '') === squashed) return name;
  }
  return null;
}

/**
 * The address each household had before any concentration ran.
 *
 * Reads every backup oldest-first and keeps the last copy that carries NO `purok` —
 * the purok is the fingerprint the concentration leaves behind, so its absence is
 * what identifies an untouched address. A household added after the first run is
 * only untouched in a later backup, which is why all of them are scanned rather
 * than just the oldest.
 */
function trueAddresses() {
  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('barangay-zones') && f.endsWith('.json'))
    .sort();

  const original = new Map();
  for (const file of files) {
    const snapshot = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, file), 'utf8'));
    for (const row of snapshot.connections || []) {
      const address = row.serviceAddress;
      if (!address || address.purok) continue;
      if (!original.has(row._id)) original.set(row._id, address);
    }
  }
  return original;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  console.log(`database: ${mongoose.connection.name}${dryRun ? '   (DRY RUN — nothing written)' : ''}\n`);

  const zonesCol = db.collection('zones');
  const assignCol = db.collection('zoneassignments');
  const connCol = db.collection('serviceconnections');

  const [connections, employments, people, allowRows, credRows] = await Promise.all([
    connCol.find({}).toArray(),
    db.collection('employments').find({}).toArray(),
    db.collection('collectorpersons').find({}).toArray(),
    db.collection('collector_allowlist').find({}).toArray(),
    db.collection('mobilecredentials').find({}).toArray(),
  ]);

  const original = trueAddresses();
  console.log(`recovered ${original.size} original address(es) from backups\n`);

  // ---- group households by their TRUE barangay ------------------------------
  const byBarangay = new Map();
  const unknown = [];
  const restored = [];

  for (const connection of connections) {
    const address = original.get(String(connection._id)) || connection.serviceAddress;
    const official = officialBarangay(address && address.barangay);
    if (!official) { unknown.push({ connection, address }); continue; }
    if (!byBarangay.has(official)) byBarangay.set(official, []);
    byBarangay.get(official).push({ connection, address });
    restored.push({ connection, address, barangay: official });
  }

  if (unknown.length) {
    console.log(`⚠️  ${unknown.length} household(s) with a barangay not in the district's list:`);
    for (const u of unknown) {
      console.log(`     ${u.connection.accountNo} — "${u.address && u.address.barangay}"`);
    }
    console.log('    Left where they are.\n');
  }

  // ---- plan the zones -------------------------------------------------------
  const plan = [];
  for (const [barangay, households] of [...byBarangay.entries()].sort()) {
    const purokCount = PUROKS[barangay];
    // Only as many zones as there is work to fill, and never more puroks than the
    // barangay actually has. Three households make one round of three, not three
    // rounds of one.
    const zoneCount = Math.max(1, Math.min(purokCount, Math.ceil(households.length / TARGET_ROUND)));
    households.sort((a, b) => String(a.connection.accountNo).localeCompare(String(b.connection.accountNo)));

    const zonesUsed = new Map();
    households.forEach((entry, index) => {
      const purok = (index % zoneCount) + 1;
      if (!zonesUsed.has(purok)) zonesUsed.set(purok, []);
      zonesUsed.get(purok).push(entry);
    });
    plan.push({ barangay, purokCount, zoneCount, zonesUsed, total: households.length });
  }

  console.log('barangay              puroks  zones  households');
  for (const b of plan) {
    console.log(
      `  ${b.barangay.padEnd(20)} ${String(b.purokCount).padStart(4)}  ${String(b.zoneCount).padStart(5)}  ${String(b.total).padStart(9)}`
    );
  }

  const totalZones = plan.reduce((n, b) => n + b.zoneCount, 0);
  const allowlisted = new Set(allowRows.map((r) => String(r.email || '').toLowerCase()));
  const credentialed = new Set(credRows.map((r) => String(r.identifier || r.email || '').toLowerCase()));
  const emailOf = (employment) => {
    const person = people.find((p) => String(p._id) === String(employment.personId));
    return person && person.email ? String(person.email).toLowerCase() : null;
  };
  const canSignIn = (e) => {
    const email = emailOf(e);
    return Boolean(email && (allowlisted.has(email) || credentialed.has(email)));
  };
  const ranked = [...employments].sort(
    (a, b) => (canSignIn(a) ? 0 : emailOf(a) ? 1 : 2) - (canSignIn(b) ? 0 : emailOf(b) ? 1 : 2)
  );

  console.log('\nsummary');
  console.log(`  barangays with households ....... ${plan.length}`);
  console.log(`  zones ........................... ${totalZones}`);
  console.log(`  households ...................... ${restored.length}`);
  console.log(`  average round ................... ${(restored.length / totalZones).toFixed(1)} stops`);
  console.log(`  collectors available ............ ${employments.length}`);
  console.log(`  collectors that will be posted .. ${Math.min(totalZones, employments.length)}`);
  if (totalZones > employments.length) {
    console.log(`  ⚠️  ${totalZones - employments.length} zone(s) will have NO collector`);
  }

  if (dryRun) { console.log('\ndry run — nothing written. Re-run with --yes to apply.'); await mongoose.disconnect(); return; }
  if (!args.includes('--yes')) { console.log('\nRefusing to write without --yes.'); await mongoose.disconnect(); process.exitCode = 1; return; }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = path.join(BACKUP_DIR, `true-barangay-${stamp}.json`);
  fs.writeFileSync(backup, JSON.stringify({
    connections: connections.map((c) => ({ _id: String(c._id), zoneId: c.zoneId ? String(c.zoneId) : null, serviceAddress: c.serviceAddress })),
    assignments: (await assignCol.find({ status: 'current' }).toArray()).map((a) => ({ _id: String(a._id), status: a.status, endDate: a.endDate ?? null })),
  }, null, 1));
  console.log(`\nbacked up -> ${backup}`);

  // ---- create zones and place households ------------------------------------
  const zoneIdFor = new Map();
  let placed = 0;

  for (const b of plan) {
    for (let purok = 1; purok <= b.zoneCount; purok++) {
      const zoneCode = `${b.barangay.toUpperCase().replace(/[^A-Z0-9]/g, '')}-Z${purok}`;
      const res = await zonesCol.findOneAndUpdate(
        { zoneCode },
        { $set: {
            zoneCode,
            zoneName: `${b.barangay} – Zone ${purok}`,
            barangay: b.barangay,
            purok,
            isActive: true,
            createdByScript: 'rezone-by-true-barangay',
            updatedAt: new Date(),
          } },
        { upsert: true, returnDocument: 'after' }
      );
      zoneIdFor.set(`${b.barangay}|${purok}`, (res.value || res)._id);
    }

    for (const [purok, households] of b.zonesUsed) {
      const zoneId = zoneIdFor.get(`${b.barangay}|${purok}`);
      for (const { connection, address } of households) {
        await connCol.updateOne(
          { _id: connection._id },
          { $set: {
              zoneId,
              // The registry's own address, with only the purok added.
              serviceAddress: { ...address, barangay: b.barangay, purok: `Zone ${purok}` },
            } }
        );
        placed++;
      }
    }
  }
  console.log(`created/updated ${totalZones} zone(s)`);
  console.log(`restored and placed ${placed} household(s) in their own barangay`);

  const retired = await zonesCol.updateMany(
    { createdByScript: { $ne: 'rezone-by-true-barangay' }, isActive: { $ne: false } },
    { $set: { isActive: false, retiredAt: new Date(), retiredReason: 'Superseded by true-barangay zones' } }
  );
  if (retired.modifiedCount > 0) console.log(`retired ${retired.modifiedCount} other zone(s) — kept, not deleted`);

  // ---- one collector per zone ----------------------------------------------
  await assignCol.updateMany({ status: 'current' }, { $set: { status: 'ended', endDate: new Date() } });

  const targets = [];
  for (const b of plan) {
    for (const purok of [...b.zonesUsed.keys()].sort((x, y) => x - y)) {
      targets.push({ barangay: b.barangay, purok, households: b.zonesUsed.get(purok).length });
    }
  }
  targets.sort((a, b) => b.households - a.households);

  let posted = 0;
  for (const target of targets) {
    const employment = ranked[posted];
    if (!employment) break;
    await assignCol.insertOne({
      employmentId: employment._id,
      zoneId: zoneIdFor.get(`${target.barangay}|${target.purok}`),
      assignedDate: new Date(),
      endDate: null,
      status: 'current',
      createdByScript: 'rezone-by-true-barangay',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    posted++;
  }
  console.log(`posted ${posted} collector(s), one per zone`);

  await mongoose.disconnect();
}

main().catch((err) => { console.error('FAILED:', err.message); process.exit(1); });
