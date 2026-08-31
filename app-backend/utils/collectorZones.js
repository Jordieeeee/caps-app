const ZoneAssignment = require('../models/ZoneAssignment');
const Zone = require('../models/Zone');

/**
 * The zones a collector is currently posted to.
 *
 * ⚠️ THIS IS THE ROUTE ASSIGNMENT THE ROUTE ENDPOINT SAID DID NOT EXIST. `listRoute`
 * carried a long note explaining that nothing in the database could scope a route to
 * one collector, so every collector received the district's entire customer list and
 * the app filtered it by barangay. That was true of `Collector.routeIds`, which is
 * still empty on every real employment record — but it was never true of the portal,
 * which assigns collectors to ZONES:
 *
 *     zoneassignments   employmentId → zoneId, status 'current'   (25 live rows)
 *     serviceconnections.zoneId                                   (28 of 28 set)
 *
 * Both halves of the join have been sitting there the whole time under a different
 * name. `req.collectorScope.collectorId` is the `employments._id` for a portal
 * collector — see presentPortal in services/collector-registry.js, which anchors a
 * collector to the posting rather than the person precisely because zone assignments
 * hang off it — so it is the key this query needs, with nothing to translate.
 *
 * Returns null, never an empty list, when the collector has no current posting.
 * Null means "cannot scope" and the caller must fall back to the full district list:
 * a collector whose assignment the office has not entered yet needs a working route
 * more than a correct one, and an empty route screen at 7am is indistinguishable
 * from a broken app. An empty array would silently strand them.
 */
async function currentZoneIds(collectorId) {
  if (!collectorId) return null; // Admin, or an unresolvable identity.

  const assignments = await ZoneAssignment.find({
    employmentId: collectorId,
    status: 'current',
  })
    .select('zoneId')
    .lean();

  const ids = assignments.map((a) => a.zoneId).filter(Boolean);
  return ids.length ? ids : null;
}

/** Zone labels for a set of ids, in the portal's own words. Display only. */
async function zoneNames(zoneIds) {
  if (!zoneIds || zoneIds.length === 0) return [];
  const zones = await Zone.find({ _id: { $in: zoneIds } })
    .select('zoneName zoneCode')
    .lean();
  return zones.map((z) => z.zoneName || z.zoneCode).filter(Boolean);
}

module.exports = { currentZoneIds, zoneNames };
