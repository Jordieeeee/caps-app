/**
 * Audit the district's zone postings against the rule: ONE COLLECTOR PER ZONE.
 *
 * A collector's assigned route IS their zone — `GET /accounts/route` filters
 * connections on it (see utils/collectorZones.js), so a posting that breaks the rule
 * silently changes who walks which households:
 *
 *   zone with several collectors  every one of them gets the same stops, and
 *                                 nothing in the district says who actually goes
 *   zone with no collector        its households appear on nobody's route
 *   collector with several zones  the route merges them, so their screen shows a
 *                                 round the office never assigned
 *   collector with no zone        falls back to the whole district, deliberately —
 *                                 an empty route at 7am reads as a broken app
 *
 * This backend cannot fix any of it: `zones`, `zoneassignments` and
 * `serviceconnections` are the Admin Portal's registry and are declared read-only
 * here. So this prints the worklist for whoever holds the portal, and exits non-zero
 * when the district is not in the shape the rule describes — usable from CI or a
 * pre-deployment check.
 *
 *     node scripts/audit-zone-assignments.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Zone = require('../models/Zone');
const ZoneAssignment = require('../models/ZoneAssignment');
const ServiceConnection = require('../models/ServiceConnection');
const Employment = require('../models/Employment');
const CollectorPerson = require('../models/CollectorPerson');

function heading(text) {
  console.log(`\n${text}\n${'-'.repeat(text.length)}`);
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);

  const [zones, assignments, connections, employments, people] = await Promise.all([
    /**
     * Active zones only. A retired zone (`isActive: false`) is one the district has
     * taken out of service — the nine district-wide zones superseded by the
     * barangay-scoped ones are the example. They are kept rather than deleted
     * because fifty-six ended postings still reference them, and that is the
     * district's record of who used to walk where; reporting them as "no collector"
     * would be flagging a problem in history nobody can fix.
     */
    Zone.find({ isActive: { $ne: false } }).lean(),
    ZoneAssignment.find({ status: 'current' }).lean(),
    ServiceConnection.find({}).select('accountNo zoneId serviceAddress').lean(),
    Employment.find({}).lean(),
    CollectorPerson.find({}).lean(),
  ]);

  const zoneName = new Map(zones.map((z) => [String(z._id), z.zoneName || z.zoneCode || String(z._id)]));
  const nameOfPerson = new Map(
    people.map((p) => [String(p._id), CollectorPerson.displayName(p) || 'Unnamed'])
  );
  const employmentById = new Map(employments.map((e) => [String(e._id), e]));
  const nameOfEmployment = (id) => {
    const employment = employmentById.get(String(id));
    if (!employment) return `unknown employment ${id}`;
    return nameOfPerson.get(String(employment.personId)) || employment.employeeNo || String(id);
  };

  const collectorsByZone = new Map(zones.map((z) => [String(z._id), []]));
  const zonesByCollector = new Map();
  for (const assignment of assignments) {
    const zone = String(assignment.zoneId);
    if (!collectorsByZone.has(zone)) collectorsByZone.set(zone, []);
    collectorsByZone.get(zone).push(assignment.employmentId);

    const employment = String(assignment.employmentId);
    zonesByCollector.set(employment, (zonesByCollector.get(employment) || []).concat(zone));
  }

  const householdsByZone = new Map();
  for (const connection of connections) {
    const zone = String(connection.zoneId);
    householdsByZone.set(zone, (householdsByZone.get(zone) || []).concat(connection));
  }

  const problems = [];

  heading('Zones — the rule is exactly one collector each');
  for (const zone of zones) {
    const id = String(zone._id);
    const collectors = collectorsByZone.get(id) || [];
    const households = householdsByZone.get(id) || [];
    const verdict =
      collectors.length === 1 ? 'ok' : collectors.length === 0 ? 'NO COLLECTOR' : `${collectors.length} COLLECTORS`;
    if (collectors.length !== 1) {
      problems.push(`${zoneName.get(id)}: ${verdict.toLowerCase()}`);
    }
    console.log(
      `  ${String(zoneName.get(id)).padEnd(10)} ${verdict.padEnd(14)} ${String(households.length).padStart(3)} household(s)`
    );
    if (collectors.length > 1) {
      console.log(`             ${collectors.map(nameOfEmployment).join(', ')}`);
    }
  }

  heading('Collectors holding more than one zone');
  const overloaded = [...zonesByCollector.entries()].filter(([, z]) => z.length > 1);
  if (overloaded.length === 0) console.log('  none');
  for (const [employment, zoneIds] of overloaded) {
    console.log(`  ${nameOfEmployment(employment)} -> ${zoneIds.map((z) => zoneName.get(z)).join(', ')}`);
    problems.push(`${nameOfEmployment(employment)} holds ${zoneIds.length} zones`);
  }

  /**
   * A NOTE, NOT A PROBLEM. The district's rule is one collector per zone — it is not
   * that every collector holds one. A district with more staff than zones has
   * spares, which is ordinary, and counting each of them as a fault made the exit
   * code useless: it could never reach zero while anyone was between postings.
   *
   * Still listed, because it is not nothing: an unposted collector who signs in gets
   * the whole district by design (utils/collectorZones.js returns null, and the app
   * says "All zones — no zone assigned to you"). Worth seeing; not worth failing on.
   */
  heading('Collectors with no zone — a note, not a fault');
  const unposted = employments.filter((e) => !zonesByCollector.has(String(e._id)));
  console.log(
    unposted.length === 0
      ? '  none'
      : `  ${unposted.length} spare collector(s); each would receive the whole district if they signed in.`
  );
  if (unposted.length > 0 && process.argv.includes('--verbose')) {
    for (const employment of unposted) console.log(`    ${nameOfEmployment(employment._id)}`);
  }

  heading('Households in a zone nobody is posted to');
  let stranded = 0;
  for (const [zone, households] of householdsByZone) {
    if ((collectorsByZone.get(zone) || []).length > 0) continue;
    stranded += households.length;
    console.log(`  ${zoneName.get(zone) || zone}: ${households.map((h) => h.accountNo).join(', ')}`);
  }
  if (stranded === 0) console.log('  none');

  heading('Summary');
  console.log(`  zones ................ ${zones.length}`);
  console.log(`  posted collectors .... ${zonesByCollector.size}`);
  console.log(`  households ........... ${connections.length}`);
  console.log(`  zones needed for 1:1 . ${zonesByCollector.size}`);
  console.log(`  problems ............. ${problems.length}`);

  await mongoose.disconnect();
  if (problems.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
