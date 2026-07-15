/**
 * Wrap an async controller so rejected promises reach the error handler
 * via next(err) instead of crashing the process.
 */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = asyncHandler;
