/**
 * Types for the Google sign-in flow (roles: unclaimed → consumer/collector).
 *
 * Deliberately separate from types/auth.ts: that file mirrors the email/password
 * system's wire contract (capitalised roles, refresh tokens). This flow has its
 * own backend contract — { sessionToken, role, email } from
 * POST /auth/google/callback — and will grow into the claim/verify phase.
 * Merging them now would couple two systems that evolve on different clocks.
 */

/** Roles the Google-flow backend can issue in a session. Lowercase by design —
 * these are NOT the email/password system's 'Consumer'/'Collector' values. */
export const GOOGLE_APP_ROLES = ['unclaimed', 'consumer', 'collector'] as const;
export type GoogleAppRole = (typeof GOOGLE_APP_ROLES)[number];

export function isGoogleAppRole(value: unknown): value is GoogleAppRole {
  return (GOOGLE_APP_ROLES as readonly unknown[]).includes(value);
}

/** Exactly what POST /auth/google/callback returns and what we persist. */
export interface GoogleSession {
  sessionToken: string;
  role: GoogleAppRole;
  email: string;
}

/** Why a sign-in attempt ended without a session. Drives UI copy; `detail`
 * never reaches the screen — it exists for logs. */
export type GoogleSignInFailure =
  /** User closed the browser / denied consent. Not an error worth alarming over. */
  | { kind: 'cancelled' }
  /** Provider returned an OAuth error before we reached our backend. */
  | { kind: 'provider'; detail?: string }
  /** Our own backend refused the id_token (401) or failed (5xx). */
  | { kind: 'rejected' }
  /** Device could not reach the network or the API at all. */
  | { kind: 'network' };

// ---------------------------------------------------------------------------
// Claim / verify flow (POST /consumer/claim-account, POST /consumer/verify-claim)
// ---------------------------------------------------------------------------

/** What POST /consumer/claim-account answers with on success. */
export interface ClaimChallenge {
  challenge: 'otp';
  maskedNumber: string;
}

/**
 * Machine-readable outcomes of the claim flow. Mirrors
 * app-backend/utils/errorCodes.js plus two client-only kinds — same mirroring
 * rule as AuthErrorCode in types/auth.ts: codes are wire contract and may not
 * be reworded; messages may.
 *
 * OTP_INVALID deliberately covers wrong/expired/superseded/never-issued as one
 * value — the backend refuses to distinguish them, and so does this type.
 */
export const ClaimErrorCode = {
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  NO_MOBILE_ON_FILE: 'NO_MOBILE_ON_FILE',
  OTP_INVALID: 'OTP_INVALID',
  SMS_DELIVERY_FAILED: 'SMS_DELIVERY_FAILED',
  /** Backend answered 5xx or something unparseable. Client-invented value. */
  SERVER: 'SERVER',
  /** Request never left the device / never reached the API. Client-invented. */
  NETWORK: 'NETWORK',
} as const;
// eslint-disable-next-line @typescript-eslint/no-redeclare -- see AuthErrorCode in types/auth.ts
export type ClaimErrorCode = (typeof ClaimErrorCode)[keyof typeof ClaimErrorCode];

/**
 * Failure of a claim-flow call. The message is ALWAYS the backend's own
 * generic wording when one exists (those strings were written to be shown to
 * consumers verbatim); NETWORK/SERVER substitute client-side copy.
 */
export class GoogleFlowError extends Error {
  readonly code: ClaimErrorCode;
  readonly status?: number;

  constructor(code: ClaimErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'GoogleFlowError';
    this.code = code;
    this.status = status;
  }
}
