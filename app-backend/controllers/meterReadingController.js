const Meter = require('../models/Meter');
const MeterReading = require('../models/MeterReading');
const ServiceConnection = require('../models/ServiceConnection');
const calculateConsumption = require('../utils/calculateConsumption');

/**
 * The meter this account's reading belongs to, in the portal's own keys.
 *
 * The app knows an account number; the portal's reading queue and its billing run
 * know a `connectionId`, and its meter registry knows a `meterId`. Resolving them
 * here is the whole reason a reading taken at a gate now reaches a bill.
 *
 * Both come back null where the district holds no record — an account number the
 * registry does not have, or a connection with no meter installed against it. Null
 * is stored as null rather than guessed at: a reading filed against the wrong
 * connection bills the wrong household, which is worse than a reading the portal
 * cannot see. The response says which happened so the phone need not assume.
 */
async function portalKeysFor(accountNumber) {
  const connection = await ServiceConnection.findOne({ accountNo: accountNumber })
    .select('_id')
    .lean();
  if (!connection) return { connectionId: null, meterId: null };

  // Newest installation wins, matching accountController's meterSerialByConnection:
  // a connection that has had its meter replaced reads against the box on the wall.
  // A removed meter is never referenced — that serial is not the one being read.
  const meter = await Meter.findOne({ connectionId: connection._id, removalDate: null })
    .select('_id')
    .sort({ installDate: -1 })
    .lean();

  return { connectionId: connection._id, meterId: meter ? meter._id : null };
}

// Idempotent sync endpoint: upserts on the client-generated id so a replayed
// offline queue never creates duplicate readings.
exports.sync = async (req, res) => {
  const consumption = calculateConsumption(req.body.previousReading, req.body.currentReading);
  const period = MeterReading.periodOf(req.body.readingDate);
  const { connectionId, meterId } = await portalKeysFor(req.body.accountNumber);

  const reading = await MeterReading.upsertFromClient({
    ...req.body,
    consumption,
    /**
     * The portal's shape of the same visit. See the block comment on these fields
     * in models/MeterReading.js: without them the reading is stored, is correct,
     * and is invisible to every system that turns a reading into a bill.
     */
    connectionId,
    meterId,
    consumptionCuM: consumption,
    source: 'mobile',
    // Derived here, never taken from the body: it is the key that decides which
    // readings compete to be the one that stands for this meter-month.
    period,
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

  /**
   * A re-read of the same meter in the same month is a CORRECTION, not a second
   * bill — and until now it became one. The phone generates a fresh clientId for
   * each reading (it must; they are separate records in its outbox), so the upsert
   * above cannot tell a correction from a new fact. This asks the second question:
   * of everything filed for this meter-month, which one stands?
   *
   * Runs after the upsert so the record being synced is part of the group it is
   * resolved against, and recomputes the whole group rather than comparing pairs,
   * so replays and out-of-order arrivals converge. See MeterReading.resolvePeriod.
   */
  const standing = await MeterReading.resolvePeriod(reading.accountNumber, period);

  const stands = !standing || String(standing._id) === String(reading._id);

  res.json({
    reading,
    /**
     * Whether the reading just filed is the one that stands. False means the phone
     * sent an older reading for a meter-month that has since been re-read — it is
     * stored and auditable, but it is not what TWD bills from.
     */
    stands,
    /**
     * Whether this reading can reach a bill at all.
     *
     * True means it is in the portal's review queue under a connection the district
     * recognises; the household's app will show it as read, and an approver can turn
     * it into a bill. False means the account number resolved to no service
     * connection, so the record is stored and auditable and nothing downstream can
     * see it — a clerical gap in the registry, not a failed sync, and one the office
     * has to close. Reported rather than inferred: "saved" and "will be billed" are
     * different claims and the phone must not merge them.
     */
    queuedForBilling: Boolean(reading.connectionId) && stands,
  });
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
