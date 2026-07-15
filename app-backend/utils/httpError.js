/**
 * Build an Error carrying an HTTP status code, for the central error handler.
 * Pure factory — no Express/Mongoose dependencies.
 *
 * `errorCode` is a stable, machine-readable discriminator (see utils/errorCodes)
 * for clients that must branch on *why* a request failed rather than parse the
 * human-readable message. Named `errorCode`, not `code`, because Mongo drivers
 * already put their own numeric `code` on errors.
 *
 * @param {number} statusCode
 * @param {string} message
 * @param {string} [errorCode]
 * @returns {Error & { statusCode: number, expose: boolean, errorCode?: string }}
 */
function httpError(statusCode, message, errorCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.expose = true; // safe to reveal this message to the client
  if (errorCode) err.errorCode = errorCode;
  return err;
}

module.exports = httpError;
