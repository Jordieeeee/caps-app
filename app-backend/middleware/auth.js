const jwt = require('jsonwebtoken');
const httpError = require('../utils/httpError');
const ErrorCodes = require('../utils/errorCodes');

/**
 * Verify the Bearer JWT and attach the decoded payload to req.user.
 * Payload shape: { sub, role, name }.
 *
 * Carries TOKEN_EXPIRED so the client can tell "refresh and retry this request"
 * apart from "this request was genuinely forbidden" without parsing messages.
 */
function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return next(httpError(401, 'Authentication required', ErrorCodes.TOKEN_EXPIRED));
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    next(httpError(401, 'Invalid or expired token', ErrorCodes.TOKEN_EXPIRED));
  }
}

/**
 * Restrict a route to one or more roles. Use after `auth`.
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(httpError(403, 'Insufficient permissions', ErrorCodes.ROLE_NOT_PERMITTED));
    }
    next();
  };
}

module.exports = { auth, requireRole };
