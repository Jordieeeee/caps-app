const GoogleUser = require('../models/GoogleUser');
const CollectorAllowlist = require('../models/CollectorAllowlist');
const Collector = require('../models/Collector');
const AppCredential = require('../models/AppCredential');
const httpError = require('../utils/httpError');
const ErrorCodes = require('../utils/errorCodes');

/**
 * Resolve WHICH collector employee record the caller is acting as, for either
 * identity system, and hand controllers that answer instead of a user id.
 *
 * Why this exists: the collector endpoints gated on `requireRole('Collector')`,
 * an exact string match. The Google flow mints a lowercase `'collector'`
 * (googleAuthController.js — allowlist membership grants it per-session), so
 * every one of them 403'd for an allowlisted collector: the route list, reading
 * sync, service orders and the collector profile. They could sign in and reach
 * the collector shell, and then nothing in it worked.
 *
 * The role string was only the first half. The second is identity: `req.user.sub`
 * is a `collectors._id` for a password session but a `google_users._id` for a
 * Google one, and the controllers behind these routes key off it —
 * `collectorId` stamped on every meter reading, `Collector.findById` for the
 * profile. Bridging the role alone would have filed readings against a collector
 * id matching no employee, which fails silently and is worse than the 403.
 *
 * So the Google branch resolves through to a real `collectors` document by the
 * Google-VERIFIED email, and refuses the request when it cannot. An allowlisted
 * Google identity with no employee record is a configuration mistake in the
 * office, and it should say so on the first request rather than quietly writing
 * unattributable work.
 *
 * Attaches `req.collectorScope`:
 *   kind        — 'password' | 'google' | 'admin'
 *   collectorId — the `collectors._id` to scope reads and stamp writes with.
 *                 NULL for admin, which is the one caller entitled to look
 *                 across collectors; controllers must treat null as "no filter",
 *                 never as "no access".
 *
 * SECURITY: nothing here is read from the body or params. The Google branch
 * re-derives standing from the database on every request — allowlist membership
 * and the employee record's status, never the JWT's role claim — matching
 * middleware/google-access.js and middleware/admin.js. A token minted before an
 * admin removed someone from the allowlist must not outvote the row recording
 * the removal.
 */
function requireCollectorScope({ allowAdmin = false } = {}) {
  return async (req, res, next) => {
    try {
      if (!req.user?.sub) {
        return next(httpError(403, 'Insufficient permissions', ErrorCodes.ROLE_NOT_PERMITTED));
      }

      // --- Admin ------------------------------------------------------------
      // Only where the route already admitted Admin (readings, service orders).
      // Same trust model as the requireRole it replaces there.
      if (allowAdmin && req.user.role === 'Admin') {
        req.collectorScope = { kind: 'admin', collectorId: null };
        return next();
      }

      // --- Password collector ----------------------------------------------
      // Behaviour deliberately unchanged: `sub` IS the collectors._id, so every
      // existing query produces exactly the result it did before.
      if (req.user.role === 'Collector') {
        req.collectorScope = { kind: 'password', collectorId: req.user.sub };
        return next();
      }

      // --- Google-flow collector -------------------------------------------
      // The lowercase 'collector' claim is not sufficient on its own; it is not
      // consulted at all. Standing is the allowlist row, read now.
      const user = await GoogleUser.findById(req.user.sub).lean();
      if (!user || !user.email) {
        return next(httpError(403, 'Insufficient permissions', ErrorCodes.ROLE_NOT_PERMITTED));
      }

      const email = String(user.email).toLowerCase().trim();
      if (!(await CollectorAllowlist.isAllowed(email))) {
        return next(httpError(403, 'Insufficient permissions', ErrorCodes.ROLE_NOT_PERMITTED));
      }

      const collector = await findCollectorByEmail(email);
      if (!collector) {
        // Distinct from the generic 403 on purpose. This caller is already an
        // authenticated, allowlisted collector, so there is no account-existence
        // oracle to protect here — and "allowlisted but not matched to an
        // employee record" is a problem only the office can fix. A generic
        // "insufficient permissions" would send them to the wrong person.
        return next(
          httpError(
            403,
            'Your collector record could not be matched to this email. Ask the office to check your employee record.',
            ErrorCodes.ROLE_NOT_PERMITTED
          )
        );
      }

      // Employment status, re-read like everything else. A collector disabled in
      // the portal keeps a valid Google session for up to seven days
      // (GOOGLE_SESSION_TTL); the allowlist is about who MAY be a collector, and
      // this is about whether they still are one.
      if (collector.status && collector.status !== 'active') {
        return next(httpError(403, 'Insufficient permissions', ErrorCodes.ROLE_NOT_PERMITTED));
      }

      req.collectorScope = { kind: 'google', collectorId: String(collector._id) };
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

/**
 * Google email -> `collectors` document, by the two links that exist.
 *
 * The profile's own `email` is tried first: it is required and unique
 * (models/Collector.js), so a match there is unambiguous. Portal-created staff
 * are the gap — models/AppCredential.js:16 notes the portal's login email "never
 * even matches the profile's", and the profile may carry no email at all — so
 * the credential store is the second link, narrowed to collector credentials so
 * a shared address can never resolve a consumer or admin login into a collector
 * session.
 */
async function findCollectorByEmail(email) {
  const direct = await Collector.findOne({ email }).lean();
  if (direct) return direct;

  const cred = await AppCredential.findByEmail(email);
  if (!cred || String(cred.role).toLowerCase() !== 'collector') return null;
  // The portal's own kill switch, same check authController.refresh applies.
  if (cred.status && cred.status !== 'active') return null;

  return Collector.findById(cred.profileId).lean();
}

module.exports = { requireCollectorScope };
