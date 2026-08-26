const User = require('../models/User');
const AppCredential = require('../models/AppCredential');
const httpError = require('../utils/httpError');
const ErrorCodes = require('../utils/errorCodes');

/**
 * Gate for admin-only routes (allowlist management, link unlinking).
 * MUST run after middleware/auth.
 *
 * Same DB-re-derivation discipline as google-access.js, applied to portal
 * admins: load models/User by req.user.sub and require a CURRENT Admin row in
 * good standing — not merely an Admin string inside a possibly-stale JWT.
 * Mirrors the two gates refresh() applies (profile status + portal credential
 * status) so deactivating an admin anywhere cuts them off here immediately.
 *
 * A Google-flow session (sub pointing at google_users) resolves to no User
 * document and fails closed with the same generic 403 — which also means the
 * two identity systems cannot be confused by shaping a token.
 */
async function requireDbAdmin(req, res, next) {
  try {
    const admin = req.user?.sub ? await User.findById(req.user.sub) : null;
    if (!admin || admin.role !== 'Admin' || admin.status !== 'active') {
      return next(httpError(403, 'Insufficient permissions', ErrorCodes.ROLE_NOT_PERMITTED));
    }
    // Portal-side kill switch: a disabled credential ends admin access even
    // though the profile row still says active (same rule as authController.refresh).
    const cred = await AppCredential.findByProfile(admin.id);
    if (cred && cred.status !== 'active') {
      return next(httpError(403, 'Insufficient permissions', ErrorCodes.ROLE_NOT_PERMITTED));
    }
    req.admin = admin;
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { requireDbAdmin };
