const MeterReading = require('../models/MeterReading');
const calculateConsumption = require('../utils/calculateConsumption');

// Idempotent sync endpoint: upserts on the client-generated id so a replayed
// offline queue never creates duplicate readings.
exports.sync = async (req, res) => {
  const consumption = calculateConsumption(req.body.previousReading, req.body.currentReading);
  const reading = await MeterReading.upsertFromClient({
    ...req.body,
    consumption,
    // Trust the resolved collector, not the client. requireCollectorScope
    // turns EITHER identity system's token into the same collectors._id, so a
    // reading filed from a Google session is attributable to the same employee
    // as one filed from their password session.
    //
    // The fallback is the Admin case, and only that: the scope hands Admin a
    // null collectorId because `list` below must stay unfiltered for them, but
    // `collectorId` is required on the model (models/MeterReading.js), so a
    // null would fail validation on a write that used to stamp `sub`. Admin has
    // no caller in the mobile app — portal accounts get no mobile session — so
    // this preserves a path nothing exercises rather than inventing one.
    collectorId: req.collectorScope.collectorId ?? req.user.sub,
  });
  res.json({ reading });
};

/**
 * A collector's own readings — never the district's.
 *
 * This used to run `find({})` behind a bare `auth` with no `requireRole`, so any
 * signed-in consumer could `GET /readings` with no query string and receive every
 * meter reading TWD holds: account number, consumption and reading date for every
 * household, unfiltered. That is the same hole the route file has now closed twice
 * before — see the removed `/collections` in routes/index.js and the removed
 * `GET /billing/:accountNumber` in routes/billingRoutes.js, which was an IDOR over
 * sequential account numbers printed on every bill.
 *
 * The role gate lives on the route; the scoping lives here, and the two are not
 * interchangeable. `collectorId` is forced from the resolved scope rather than read
 * from a query parameter for the same reason `sync` above takes it from there — a
 * collector who can name another collector can read that collector's whole route.
 * Admin is the one role that may look across collectors, because reconciling the
 * district's readings is the job, and it is the only caller requireCollectorScope
 * hands a null `collectorId` to.
 */
exports.list = async (req, res) => {
  const filter = {};
  if (req.query.accountNumber) filter.accountNumber = req.query.accountNumber;
  if (req.query.routeId) filter.routeId = req.query.routeId;
  // Null only for Admin — "no filter", never "no access". Both collector
  // identities resolve to a real id, so neither can read the other's route.
  if (req.collectorScope.collectorId) filter.collectorId = req.collectorScope.collectorId;
  const readings = await MeterReading.listByFilter(filter);
  res.json({ readings });
};
