const GoogleUser = require('../models/GoogleUser');
const ConsumerLink = require('../models/ConsumerLink');
const ServiceConnection = require('../models/ServiceConnection');
const httpError = require('../utils/httpError');
const ErrorCodes = require('../utils/errorCodes');

/**
 * Resolve WHICH consumer records the caller is allowed to read, for either
 * identity system, and hand controllers that answer instead of a user id.
 *
 * Why this exists: consumer endpoints used to scope on `req.user.sub` directly,
 * which silently assumed the caller was a password Consumer — `sub` is a
 * `consumers._id` there, and every query keys off it. A Google-flow consumer's
 * `sub` is a `google_users._id`, which matches no service connection and no
 * bill, so those queries return nothing. Worse, the route guard in front of
 * them (`requireRole('Consumer')`) is an exact string match that the Google
 * flow's lowercase `'consumer'` never satisfies, so the request 403'd before it
 * got that far.
 *
 * The result was that the entire claim/OTP flow minted a ConsumerLink — which
 * models/ConsumerLink.js calls "the sole path every consumer-facing billing
 * endpoint must consult" — and NOTHING consulted it. This middleware is where
 * that contract finally gets enforced.
 *
 * Attaches `req.consumerScope`:
 *   consumerIds     — the consumers._id values whose bills/notifications the
 *                     caller may read. Password: exactly their own. Google:
 *                     derived from their active links.
 *   accountNumbers  — the account numbers they may see.
 *   kind            — 'password' | 'google', for controllers that must care.
 *
 * SECURITY: nothing here is taken from the request body or params. The Google
 * branch re-derives the role from the database rather than trusting the JWT's
 * claim, matching middleware/google-access.js — a token minted before an admin
 * unlink must not outvote the row that records the unlink.
 */
async function requireConsumerScope(req, res, next) {
  try {
    if (!req.user?.sub) {
      return next(
        httpError(403, 'Insufficient permissions', ErrorCodes.ROLE_NOT_PERMITTED)
      );
    }

    // --- Password consumer -------------------------------------------------
    // Same trust model as requireRole, which this replaces on these routes:
    // the JWT is ours and its role claim decides. Behaviour for this path is
    // deliberately unchanged — consumerIds is exactly [sub], so every existing
    // query produces the same result it did before.
    if (req.user.role === 'Consumer') {
      const connections = await ServiceConnection.find({
        consumerId: req.user.sub,
      }).lean();

      req.consumerScope = {
        kind: 'password',
        consumerIds: [req.user.sub],
        accountNumbers: connections.map((c) => c.accountNo).filter(Boolean),
      };
      return next();
    }

    // --- Google-flow consumer ---------------------------------------------
    // Role re-read from the row, never from the token. A lowercase 'consumer'
    // claim is not sufficient on its own.
    const user = await GoogleUser.findById(req.user.sub).lean();
    if (!user || user.role !== 'consumer') {
      return next(
        httpError(403, 'Insufficient permissions', ErrorCodes.ROLE_NOT_PERMITTED)
      );
    }

    // THE authorization read. Active links only: an admin unlink sets
    // removedAt, and that must take effect on the very next request rather
    // than whenever the user's token happens to expire.
    const links = await ConsumerLink.find({ userId: user._id, removedAt: null })
      .select('accountNumber')
      .lean();
    const accountNumbers = links.map((l) => l.accountNumber).filter(Boolean);

    // A verified identity with no live link sees an empty account list, not a
    // 403: they are legitimately signed in and correctly entitled to nothing.
    // Returning a permissions error here would read to the user as "you are
    // not allowed to use the app", which is the wrong story.
    const connections = accountNumbers.length
      ? await ServiceConnection.find({ accountNo: { $in: accountNumbers } }).lean()
      : [];

    req.consumerScope = {
      kind: 'google',
      // Deduped: several linked accounts can belong to one registry consumer,
      // and a duplicated id would double every bill in an $in query's results
      // downstream if a caller ever grouped by it.
      consumerIds: [
        ...new Set(connections.map((c) => c.consumerId).filter(Boolean).map(String)),
      ],
      accountNumbers,
    };
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { requireConsumerScope };
