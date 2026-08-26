const GoogleUser = require('../models/GoogleUser');
const httpError = require('../utils/httpError');
const ErrorCodes = require('../utils/errorCodes');

/**
 * Gate for the Google-flow consumer routes. MUST run after middleware/auth
 * (which verifies the JWT and attaches req.user).
 *
 * Re-derives the caller's role from the database on EVERY request rather than
 * trusting the JWT's role claim. The claim was signed by us, so this is not
 * about forgery — it is about STALENESS: a token minted while the user was
 * 'unclaimed' stays valid for days after they claim or get unlinked, and any
 * check that reads the token's role instead of the row hands decision-making
 * to a snapshot. The DB row is the only current answer.
 *
 * Also attaches req.dbUser so controllers don't each repeat the lookup.
 */
function requireGoogleRoles(...roles) {
  return async (req, res, next) => {
    try {
      const user = req.user?.sub ? await GoogleUser.findById(req.user.sub) : null;
      if (!user || !roles.includes(user.role)) {
        return next(
          httpError(403, 'You do not have access to this.', ErrorCodes.ROLE_NOT_PERMITTED)
        );
      }
      req.dbUser = user;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = { requireGoogleRoles };
