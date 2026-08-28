const Collector = require('../models/Collector');
const AppCredential = require('../models/AppCredential');
const CollectorPerson = require('../models/CollectorPerson');
const Employment = require('../models/Employment');
const ZoneAssignment = require('../models/ZoneAssignment');
const Zone = require('../models/Zone');

/**
 * One answer to "who is this collector", from either registry.
 *
 * TWD has two, and until now this backend could only see the wrong one:
 *
 *   PORTAL  collectorpersons + employments (+ zoneassignments, zones)
 *           The district's real staff. Written by the Admin Portal.
 *   LEGACY  collectors
 *           This repo's seed script. Six invented people, and the only
 *           collection any collector endpoint consulted.
 *
 * The effect was that no actual TWD collector could use the app: a real
 * employee signing in with Google matched nothing, fell through to role
 * 'unclaimed', and was shown the CONSUMER account-claim screen. It looked like
 * the app demanding an OTP from staff; it was the app not recognising them.
 *
 * Both sources are normalised to one shape so callers never branch on origin.
 * LEGACY is kept because it still owns `passwordHash` — the email/password
 * login every collector uses in the field — and deleting it would lock the
 * seeded accounts out before the portal accounts can replace them.
 *
 * Everything here is READ-ONLY. The portal owns these collections.
 *
 * @typedef {{
 *   id: string, source: 'portal'|'legacy', name: string|null,
 *   employeeId: string|null, email: string|null, phone: string|null,
 *   zone: string|null, routeIds: string[], status: string,
 *   dateHired: string|null, memberSince: string|null
 * }} CollectorRecord
 */

/** `YYYY-MM-DD` — a calendar fact, never a timestamp. See models/Collector.js. */
function calendarDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** Zone label for an employment, or null. Display only. */
async function currentZoneName(employmentId) {
  const assignment = await ZoneAssignment.findOne({
    employmentId,
    status: 'current',
  }).lean();
  if (!assignment) return null;

  const zone = await Zone.findById(assignment.zoneId).lean();
  return zone ? zone.zoneName || zone.zoneCode || null : null;
}

async function presentPortal(employment, person) {
  return {
    // The EMPLOYMENT id, not the person's. Employee numbers, zone assignments
    // and separation all hang off the posting, and it is the stable anchor for
    // work attributed to whoever held it.
    id: String(employment._id),
    source: 'portal',
    name: CollectorPerson.displayName(person),
    employeeId: employment.employeeNo || null,
    email: person && person.email ? person.email : null,
    phone: CollectorPerson.primaryMobile(person),
    zone: await currentZoneName(employment._id),
    routeIds: Array.isArray(employment.routeIds) ? employment.routeIds : [],
    status: Employment.isActive(employment) ? 'active' : 'disabled',
    dateHired: calendarDate(employment.dateHired),
    memberSince: employment.createdAt ? new Date(employment.createdAt).toISOString() : null,
  };
}

function presentLegacy(collector, email) {
  return {
    id: String(collector._id),
    source: 'legacy',
    name: collector.name ?? null,
    employeeId: collector.employeeId ?? null,
    email: collector.email ?? email ?? null,
    phone: collector.phone ?? null,
    zone: collector.zone ?? null,
    routeIds: Array.isArray(collector.routeIds) ? collector.routeIds : [],
    status: collector.status ?? 'active',
    dateHired: collector.dateHired ?? null,
    memberSince: collector.createdAt ? new Date(collector.createdAt).toISOString() : null,
  };
}

/**
 * Email → collector, portal first.
 *
 * ⚠️ RESOLUTION IS BY `collectorpersons.email`, NOT `useraccounts.email`, and
 * that choice is load-bearing. Both collections carry an email, and in this
 * district they DISAGREE: one address appears on a `useraccounts` row for one
 * employee and on a `collectorpersons` row for another. Picking the wrong one
 * signs somebody in as a colleague — and since collectorId is stamped on every
 * meter reading, that is misattributed field work, not a cosmetic error.
 *
 * `useraccounts` loses because it is a table of INVITATIONS, not logins: every
 * row in it has `lastLoginAt: null`, no password hash, and an invite that
 * expired in July. Not one was ever activated. The person record is the
 * district's actual statement of whose address this is.
 *
 * Returns null rather than throwing: "no collector for this email" is an
 * ordinary answer that the caller turns into its own 403.
 */
async function findByEmail(rawEmail) {
  const email = String(rawEmail || '').toLowerCase().trim();
  if (!email) return null;

  const person = await CollectorPerson.findOne({ email }).lean();
  if (person) {
    const employment = await Employment.findOne({ personId: person._id }).lean();
    // A person with no posting is a registry a-half-filled-in, not a collector.
    if (employment) return presentPortal(employment, person);
  }

  // --- legacy fallback ---------------------------------------------------
  // Seeded accounts, and portal-created ones whose login lives on the shared
  // credential store. Kept until the portal registry covers every collector.
  const direct = await Collector.findOne({ email }).lean();
  if (direct) return presentLegacy(direct, email);

  const cred = await AppCredential.findByEmail(email);
  if (!cred || String(cred.role).toLowerCase() !== 'collector') return null;
  if (cred.status && cred.status !== 'active') return null;

  const profile = await Collector.findById(cred.profileId).lean();
  return profile ? presentLegacy(profile, email) : null;
}

/**
 * Id → collector, for a caller that already passed the gate.
 *
 * Tries LEGACY first because a password session's `sub` is a `collectors._id`
 * and that is the commonest caller by far; a portal id simply misses and falls
 * through. Ids from the two collections cannot collide meaningfully — they are
 * ObjectIds from different documents — so order is a performance choice, not a
 * correctness one.
 */
async function findById(id) {
  if (!id) return null;

  const legacy = await Collector.findById(id).lean().catch(() => null);
  if (legacy) return presentLegacy(legacy, null);

  const employment = await Employment.findById(id).lean().catch(() => null);
  if (!employment) return null;

  const person = await CollectorPerson.findById(employment.personId).lean();
  return presentPortal(employment, person);
}

module.exports = { findByEmail, findById };
