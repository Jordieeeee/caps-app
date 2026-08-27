const Collector = require('../models/Collector');
const AppCredential = require('../models/AppCredential');
const MeterReading = require('../models/MeterReading');
const httpError = require('../utils/httpError');
const { normaliseMobile, INVALID_MOBILE_MESSAGE } = require('../utils/phone');

/**
 * The collector's own employment record, read whole.
 *
 * Everything the app knew about a collector until now came from the JWT session
 * minted at login — a name, an email, and whatever `routeIds` happened to be on
 * the document that day. That session is then cached on the handset for up to
 * ninety days (see REFRESH_TTL_MS in authController.js), so a collector
 * transferred to another zone, given a new route, or issued a corrected employee
 * ID kept seeing the old values until they signed out — which is the one thing a
 * collector with unsynced work must not do.
 *
 * So this reads the document, every time it is asked. Self-scoped on
 * `req.collectorScope.collectorId` with no `/:id` variant, same rule as the
 * consumer profile: a collector has no business reading a colleague's employment
 * record, and the only way to guarantee that is to make the endpoint incapable of
 * naming one. The scope is what makes this work for a Google-allowlisted collector
 * too — their token's `sub` is a google_users._id and would find nothing here.
 */

/**
 * Work already filed with TWD, by this collector, over their whole service.
 *
 * Counted from what the server actually holds, never from the phone's outbox —
 * the outbox is a record of what was written locally, and the difference between
 * the two is the entire point of the sync screen. A collector reading
 * "1,204 readings submitted" here is reading a claim about TWD's database, which
 * is the only claim this page is in a position to make.
 *
 * Readings only. This used to return a payments figure beside them, counted off a
 * `collections` collection that no collector can write to: TWD's collectors read
 * meters and a consumer pays at the office. The count was therefore structurally
 * zero, and a zero beside a real number reads as someone who has done half their
 * job. The whole collections path — model, routes, offline queue — went with it.
 */
async function serviceRecord(collectorId) {
  return { readingsSubmitted: await MeterReading.countDocuments({ collectorId }) };
}

function present(raw, email) {
  return {
    id: String(raw._id),
    name: raw.name ?? null,
    employeeId: raw.employeeId ?? null,
    // The login email lives on the portal credential for portal-created staff and
    // on the profile itself for seeded ones — same gap authController backfills.
    email: email ?? raw.email ?? null,
    phone: raw.phone ?? null,
    zone: raw.zone ?? null,
    routeIds: Array.isArray(raw.routeIds) ? raw.routeIds : [],
    status: raw.status ?? 'active',
    /** `YYYY-MM-DD`, stored as a calendar fact. See models/Collector.js. */
    dateHired: raw.dateHired ?? null,
    memberSince: raw.createdAt ? new Date(raw.createdAt).toISOString() : null,
  };
}

async function loadSelf(req) {
  const collector = await Collector.findById(req.collectorScope.collectorId);
  if (!collector) throw httpError(404, 'Your collector record could not be found.');
  return collector;
}

async function respond(res, collector) {
  const cred = collector.email ? null : await AppCredential.findByProfile(collector.id);

  res.json({
    profile: {
      ...present(collector.toObject(), cred ? cred.email : null),
      service: await serviceRecord(String(collector._id)),
    },
  });
}

exports.get = async (req, res) => {
  await respond(res, await loadSelf(req));
};

/**
 * PATCH /profile/collector — the contact number, and deliberately nothing else.
 *
 * The narrow surface is the design, not an unfinished one. Everything else on this
 * record is an *employment fact set by the employer*, and handing any of it to the
 * person it describes breaks something specific:
 *
 *   • `routeIds` — a collector who can edit their own routes can assign themselves
 *     a barangay they were not sent to, and every reading they file then carries a
 *     `routeId` the office never issued. This is the field that stamps each meter
 *     reading (see reading-reports/[id].tsx), so it is an audit trail, not a
 *     preference.
 *   • `status` — self-service here means a deactivated account can reactivate
 *     itself. That is the authentication gate, from the inside.
 *   • `employeeId` — the identifier the office reconciles a day's cash against, and
 *     unique-indexed. Editable, it is a way to file work under a colleague.
 *   • `zone`, `dateHired`, `name` — HR records with paperwork behind them. A
 *     collector's name is the one printed on the receipt they hand over.
 *   • `email` — the login credential itself. It lives on the AppCredential for
 *     portal-created staff, so writing it here would silently change nothing for
 *     them and lock a seeded account out for everyone else.
 *
 * A phone number is the one thing on the record that is genuinely the collector's
 * own, that changes without paperwork, and that TWD needs to be current — it is
 * how the office reaches someone mid-route.
 *
 * Two layers again, as with the consumer: this handler reads exactly one field off
 * the body, and `$set` under `strict: true` cannot write a path that is not on the
 * schema. See models/Consumer.js for the long version of why the second layer
 * matters even when the first one looks sufficient.
 */
exports.update = async (req, res) => {
  const { phone } = req.body;

  if (phone === undefined) {
    throw httpError(400, 'Send a phone number to update.');
  }

  const normalised = normaliseMobile(phone);
  if (!normalised) throw httpError(400, INVALID_MOBILE_MESSAGE);

  const collector = await loadSelf(req);

  /**
   * A targeted `$set`, never `collector.save()`.
   *
   * `save()` validates the whole document, and this schema marks `name`, `email`,
   * `passwordHash` and `employeeId` required — none of which a portal-created
   * collector necessarily carries, because the portal writes its own registry
   * shape. Saving one would fail with validation errors about fields the collector
   * was never asked for and cannot supply. `updateOne` validates only the path
   * actually being written, which is also the honest scope: this request changes a
   * phone number, so a phone number is what should have to be valid.
   */
  const updated = await Collector.findByIdAndUpdate(
    collector.id,
    { $set: { phone: normalised } },
    { new: true, runValidators: true }
  );

  await respond(res, updated);
};
