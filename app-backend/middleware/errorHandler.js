/**
 * Central error handler. Must be mounted last, after all routes.
 * Express identifies it by its four-argument signature.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let status = err.statusCode || 500;
  let message = err.expose || status < 500 ? err.message : 'Internal server error';
  let errorCode = err.errorCode;

  // Normalise common Mongoose/Mongo errors into clean 4xx responses.
  if (err.name === 'ValidationError') {
    status = 400;
    message = Object.values(err.errors).map((e) => e.message).join(', ');
  } else if (err.name === 'CastError') {
    status = 400;
    message = `Invalid value for '${err.path}'`;
  } else if (err.code === 11000) {
    status = 409;
    message = `Duplicate value for ${Object.keys(err.keyValue || {}).join(', ')}`;
  }

  if (status >= 500) console.error(err);
  res.status(status).json(errorCode ? { error: message, code: errorCode } : { error: message });
}

module.exports = errorHandler;
