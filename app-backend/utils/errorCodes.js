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
  /** The route exists but the operation belongs to another system (e.g. the Admin Portal). */
  NOT_SUPPORTED: 'NOT_SUPPORTED',
  // --- consumer claim/verify flow (mirrored in app-frontend types when the
  // mobile screens land — additive only, older clients fall back to UNKNOWN) ---
  /** Referenced account number does not exist in the district registry. */
  NOT_FOUND: 'NOT_FOUND',
  /** Sliding-window failure limit hit, or OTP resend cooldown still running. */
  RATE_LIMITED: 'RATE_LIMITED',
  /** The Google identity already holds a claimed role. */
  ALREADY_CLAIMED: 'ALREADY_CLAIMED',
  /** The registry has no verified mobile number for this account. */
  NO_MOBILE_ON_FILE: 'NO_MOBILE_ON_FILE',
  /** Code wrong, expired, superseded, or never issued — deliberately one code. */
  OTP_INVALID: 'OTP_INVALID',
  /**
   * The SMS gateway itself failed or timed out. Distinct from every other
   * failure so the client can say "we couldn't send it" (retry makes sense,
   * soon) rather than implying the account was wrong. Never carries gateway
   * detail to the client.
   */
  SMS_DELIVERY_FAILED: 'SMS_DELIVERY_FAILED',
};

module.exports = ErrorCodes;
