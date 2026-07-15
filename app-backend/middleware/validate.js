const httpError = require('../utils/httpError');

/**
 * Reject the request unless every listed field is present and non-empty.
 * Structural validation only — no business rules.
 */
function requireFields(...fields) {
  return (req, res, next) => {
    const body = req.body || {};
    const missing = fields.filter(
      (f) => body[f] === undefined || body[f] === null || body[f] === ''
    );
    if (missing.length) {
      return next(httpError(400, `Missing required fields: ${missing.join(', ')}`));
    }
    next();
  };
}

module.exports = { requireFields };
