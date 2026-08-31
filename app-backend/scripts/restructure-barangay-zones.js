/**
 * Restructure the district into BARANGAY + ZONE (purok), one collector per zone.
 *
 * The model this implements, from the district:
 *
 *     a collector is posted to  "Barangay Boot, Zone 5"
 *     their Route shows         only Boot Zone 5's households
 *     Boot has 7 puroks         so Boot has 7 collectors
 *
 * ⚠️ NO APP CODE CHANGES. GET /accounts/route already filters connections on the
 * collector's zoneId (utils/collectorZones.js) — it does not care whether the zone
 * is called "Zone 5" or "Boot – Zone 5". Everything below is data.
 *
 * Three problems in the district's records that this fixes on the way:
 *
 *   1. A zone had no barangay. `zones` was {zoneCode, zoneName, isActive} and
 *      nothing tied it to a place, so "Boot has 7 zones" was not expressible.
 *   2. Barangay names were inconsistent — Bañadero/Banadero, Altura-South/Altura
 *      South, Poblacion/Poblacion 1/Poblacion Barangay 1. Left alone, each spelling
 *      becomes its own zone: two collectors on one barangay, neither aware of the
 *      other.
 *   3. 105 of 106 households name no purok at all. There is nothing to discover, so
 *      puroks are ASSIGNED here — deterministically by account number, so a rerun
 *      places every household exactly where it was.
 *
 * Collectors are posted only to zones that HAVE households, so nobody is handed an
 * empty route while work sits unstaffed. Whatever is left over stays unassigned:
 * the district's instruction is to use the collectors that exist, not to invent
 * them.
 *
 *     node scripts/restructure-barangay-zones.js --dry-run
 *     node scripts/restructure-barangay-zones.js --yes
 *     node scripts/restructure-barangay-zones.js --restore <backup.json>
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const BACKUP_DIR = path.join(__dirname, '..', '.backups');

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

/**
 * Spellings seen on households → the official name.
 *
 * The last two are genuine ambiguities, not typos: "Poblacion" could be any of the
 * seven, and "Janopol" could be Occidental or Oriental. Defaulted rather than
 * guessed silently — change these two lines if the district says otherwise.
 */
const ALIASES = {
  'bañadero':'Banadero', 'banadero':'Banadero',
  'altura-south':'Altura South', 'alturasouth':'Altura South',
  'banjo laurel (banjo west)':'Banjo Laurel',
  'poblacion barangay 1':'Poblacion 1','poblacion barangay 2':'Poblacion 2',
  'poblacion barangay 3':'Poblacion 3','poblacion barangay 4':'Poblacion 4',
  'poblacion barangay 5':'Poblacion 5','poblacion barangay 6':'Poblacion 6',
  'poblacion barangay 7':'Poblacion 7',
  'poblacion':'Poblacion 1',   // ambiguous — defaulted
  'janopol':'Janopol Oriental', // ambiguous — defaulted
};

const key = (s) => String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
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
 * With --concentrate, every household is re-homed into these barangays instead of
 * the one on its address.
 *
 * Why it exists: the district's 106 households scattered across 46 barangays put
 * almost every one of them alone in its own purok — 106 zones holding one household
 * each, 50 of them with no collector to spare. Every collector would open the app to
 * a route of exactly one gate, which demonstrates nothing about a round.
 *
 * These four are chosen from the district's own breakdown to span its full range —
 * 9 puroks down to 3 — so "Darasa has 9 zones, therefore 9 collectors" is visible
 * alongside "Montaña has 3". 24 zones for 106 households is 4-5 stops each: a
 * believable morning.
 */
const CONCENTRATE_INTO = ['Darasa', 'Boot', 'Wawa', 'Montaña'];

/** A purok already written into the street line, e.g. "Purok 5 Sitio Ople". */
function statedPurok(connection) {
  const line = (connection.serviceAddress && connection.serviceAddress.houseStreet) || '';
  const match = /\b(?:purok|zone)\s*([0-9]{1,2})\b/i.exec(line);
  return match ? Number(match[1]) : null;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const restoreAt = args.indexOf('--restore');

  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  console.log(`database: ${mongoose.connection.name}${dryRun ? '   (DRY RUN — nothing written)' : ''}\n`);

  const zonesCol = db.collection('zones');
  const assignCol = db.collection('zoneassignments');
  const connCol = db.collection('serviceconnections');

  if (restoreAt !== -1) {
    const file = args[restoreAt + 1];
    if (!file) throw new Error('--restore needs a backup file path');
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const c of saved.connections) {
      await connCol.updateOne(
        { _id: new mongoose.Types.ObjectId(c._id) },
        { $set: { zoneId: c.zoneId ? new mongoose.Types.ObjectId(c.zoneId) : null, serviceAddress: c.serviceAddress } }
      );
    }
    await zonesCol.deleteMany({ createdByScript: 'restructure-barangay-zones' });
    for (const a of saved.assignments) {
      await assignCol.updateOne(
        { _id: new mongoose.Types.ObjectId(a._id) },
        { $set: { status: a.status, endDate: a.endDate ? new Date(a.endDate) : null } }
      );
    }
    await assignCol.deleteMany({ createdByScript: 'restructure-barangay-zones' });
    console.log(`restored ${saved.connections.length} connection(s) and ${saved.assignments.length} assignment(s)`);
    await mongoose.disconnect();
    return;
  }

  const [connections, employments, people, currentAssignments, existingZones] = await Promise.all([
    connCol.find({}).toArray(),
    db.collection('employments').find({}).toArray(),
    db.collection('collectorpersons').find({}).toArray(),
    assignCol.find({ status: 'current' }).toArray(),
    zonesCol.find({}).toArray(),
  ]);

  const concentrate = args.includes('--concentrate');

  // ---- group households by barangay ----------------------------------------
  const byBarangay = new Map();
  const unknown = [];

  if (concentrate) {
    // One flat list of every (barangay, purok) slot, filled round-robin in account
    // order — deterministic, so a rerun places each household exactly where it was.
    const slots = [];
    for (const barangay of CONCENTRATE_INTO) {
      for (let purok = 1; purok <= PUROKS[barangay]; purok++) slots.push({ barangay, purok });
    }
    const ordered = [...connections].sort((a, b) => String(a.accountNo).localeCompare(String(b.accountNo)));
    ordered.forEach((connection, index) => {
      const slot = slots[index % slots.length];
      connection.__purok = slot.purok;
      if (!byBarangay.has(slot.barangay)) byBarangay.set(slot.barangay, []);
      byBarangay.get(slot.barangay).push(connection);
    });
  } else {
    for (const connection of connections) {
      const official = officialBarangay(connection.serviceAddress && connection.serviceAddress.barangay);
      if (!official) { unknown.push(connection); continue; }
      if (!byBarangay.has(official)) byBarangay.set(official, []);
      byBarangay.get(official).push(connection);
    }
  }

  if (unknown.length) {
    console.log(`⚠️  ${unknown.length} household(s) have a barangay not in the district's list:`);
    for (const c of unknown) console.log(`     ${c.accountNo} — "${c.serviceAddress && c.serviceAddress.barangay}"`);
    console.log('    They keep their current zone and are left alone.\n');
  }

  // ---- plan the zones and placements ---------------------------------------
  const plan = [];
  for (const [barangay, households] of [...byBarangay.entries()].sort()) {
    const purokCount = PUROKS[barangay];
    // Stable order so a rerun places every household exactly where it was.
    households.sort((a, b) => String(a.accountNo).localeCompare(String(b.accountNo)));
    const zonesUsed = new Map();
    households.forEach((connection, index) => {
      const stated = connection.__purok ?? statedPurok(connection);
      const purok = stated && stated >= 1 && stated <= purokCount ? stated : (index % purokCount) + 1;
      if (!zonesUsed.has(purok)) zonesUsed.set(purok, []);
      zonesUsed.get(purok).push(connection);
    });
    plan.push({ barangay, purokCount, zonesUsed });
  }

  const totalZones = plan.reduce((n, b) => n + b.purokCount, 0);
  const staffedZones = plan.reduce((n, b) => n + b.zonesUsed.size, 0);

  console.log('barangay              puroks  with households  households');
  for (const b of plan) {
    console.log(
      `  ${b.barangay.padEnd(20)} ${String(b.purokCount).padStart(4)}    ${String(b.zonesUsed.size).padStart(6)}          ` +
      `${String([...b.zonesUsed.values()].reduce((n, l) => n + l.length, 0)).padStart(4)}`
    );
  }

  const withLogin = (employment) => {
    const person = people.find((p) => String(p._id) === String(employment.personId));
    return person && person.email ? person.email : null;
  };
  const ranked = [...employments].sort((a, b) => (withLogin(a) ? 0 : 1) - (withLogin(b) ? 0 : 1));

  console.log('\nsummary');
  console.log(`  barangays with households ....... ${plan.length}`);
  console.log(`  zones to create (all puroks) .... ${totalZones}`);
  console.log(`  zones that have households ...... ${staffedZones}`);
  console.log(`  collectors available ............ ${employments.length}`);
  console.log(`  collectors that will be posted .. ${Math.min(staffedZones, employments.length)}`);
  if (staffedZones > employments.length) {
    console.log(`  ⚠️  ${staffedZones - employments.length} zone(s) with households will have NO collector`);
  }

  if (dryRun) { console.log('\ndry run — nothing written. Re-run with --yes to apply.'); await mongoose.disconnect(); return; }
  if (!args.includes('--yes')) { console.log('\nRefusing to write without --yes.'); await mongoose.disconnect(); process.exitCode = 1; return; }

  // ---- back up everything this touches -------------------------------------
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = path.join(BACKUP_DIR, `barangay-zones-${stamp}.json`);
  fs.writeFileSync(backup, JSON.stringify({
    connections: connections.map((c) => ({ _id: String(c._id), zoneId: c.zoneId ? String(c.zoneId) : null, serviceAddress: c.serviceAddress })),
    assignments: currentAssignments.map((a) => ({ _id: String(a._id), status: a.status, endDate: a.endDate ?? null })),
    zonesBefore: existingZones.map((z) => String(z._id)),
  }, null, 1));
  console.log(`\nbacked up -> ${backup}`);

  // ---- create zones ---------------------------------------------------------
  const zoneIdFor = new Map();
  for (const b of plan) {
    for (let purok = 1; purok <= b.purokCount; purok++) {
      const zoneCode = `${b.barangay.toUpperCase().replace(/[^A-Z0-9]/g, '')}-Z${purok}`;
      const doc = {
        zoneCode,
        zoneName: `${b.barangay} – Zone ${purok}`,
        barangay: b.barangay,
        purok,
        isActive: true,
        createdByScript: 'restructure-barangay-zones',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const res = await zonesCol.findOneAndUpdate(
        { zoneCode },
        { $set: doc },
        { upsert: true, returnDocument: 'after' }
      );
      zoneIdFor.set(`${b.barangay}|${purok}`, (res.value || res)._id);
    }
  }
  console.log(`created/updated ${totalZones} zone(s)`);

  // ---- place households -----------------------------------------------------
  let placed = 0;
  for (const b of plan) {
    for (const [purok, households] of b.zonesUsed) {
      const zoneId = zoneIdFor.get(`${b.barangay}|${purok}`);
      for (const connection of households) {
        await connCol.updateOne(
          { _id: connection._id },
          { $set: {
              zoneId,
              'serviceAddress.barangay': b.barangay,
              'serviceAddress.purok': `Zone ${purok}`,
            } }
        );
        placed++;
      }
    }
  }
  console.log(`placed ${placed} household(s) into a barangay zone`);

  // ---- post one collector per zone that has households ----------------------
  await assignCol.updateMany({ status: 'current' }, { $set: { status: 'ended', endDate: new Date() } });

  const targets = [];
  for (const b of plan) for (const purok of [...b.zonesUsed.keys()].sort((x, y) => x - y)) {
    targets.push({ barangay: b.barangay, purok, households: b.zonesUsed.get(purok).length });
  }
  // Busiest rounds first, so the collectors who can log in get the demonstrable ones.
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
      createdByScript: 'restructure-barangay-zones',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    posted++;
  }
  console.log(`posted ${posted} collector(s), one per zone that has households`);
  console.log(`\nundo with: node scripts/restructure-barangay-zones.js --restore ${backup}`);

  await mongoose.disconnect();
}

main().catch((err) => { console.error('FAILED:', err.message); process.exit(1); });
