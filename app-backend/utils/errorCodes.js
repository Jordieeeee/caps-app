/**
 * Stable, machine-readable error codes returned as `code` in error responses.
 *
 * These are API contract — the mobile client branches on them to pick an error
 * screen (see app-frontend/src/shared/types/auth.ts, which mirrors this list).
 * Messages here are for humans and may be reworded freely; codes may not.
 */
const ErrorCodes = {
  /** Identifier not found, or password mismatch. Deliberately not distinguished. */
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  /** Account exists and the password was correct, but the account is not usable. */
  ACCOUNT_DISABLED: 'ACCOUNT_DISABLED',
  /** Refresh token is unknown, expired, already rotated, or revoked. */
  REFRESH_TOKEN_INVALID: 'REFRESH_TOKEN_INVALID',
  /** Access token is missing, malformed, or past its expiry. */
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  /** Authenticated, but this role may not use this endpoint. */
  ROLE_NOT_PERMITTED: 'ROLE_NOT_PERMITTED',
};

module.exports = ErrorCodes;
