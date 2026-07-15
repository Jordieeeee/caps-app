/**
 * Auth contract shared by both roles.
 *
 * Mirrors app-backend/utils/errorCodes.js and app-backend/controllers/authController.js.
 * If you change a code or a session field here, change it there too — these are
 * the two ends of one wire.
 */

/** Roles the backend can put in a JWT. `Admin` exists server-side but has no mobile UI. */
export type Role = 'Collector' | 'Consumer' | 'Admin';

/** Roles this app is actually able to render. Admin is deliberately excluded. */
export const SUPPORTED_ROLES = ['Collector', 'Consumer'] as const;
export type SupportedRole = (typeof SUPPORTED_ROLES)[number];

export function isSupportedRole(role: string): role is SupportedRole {
  return (SUPPORTED_ROLES as readonly string[]).includes(role);
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: 'active' | 'disabled';
  /** Collector: assigned routes. */
  routeIds?: string[];
  /**
   * Consumer: linked account numbers. An array, always — consumers can link
   * several accounts up to a server-enforced cap, so nothing in the auth layer
   * may collapse this to a single "current account".
   */
  accountNumbers?: string[];
}

/** Exactly what we persist to the keychain. */
export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  /** ISO 8601. Sent by the server so we never have to trust device clock drift alone. */
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
  user: AuthUser;
}

/** Server error codes. Mirrors app-backend/utils/errorCodes.js. */
export const AuthErrorCode = {
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_DISABLED: 'ACCOUNT_DISABLED',
  REFRESH_TOKEN_INVALID: 'REFRESH_TOKEN_INVALID',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  ROLE_NOT_PERMITTED: 'ROLE_NOT_PERMITTED',
} as const;
export type AuthErrorCode = (typeof AuthErrorCode)[keyof typeof AuthErrorCode];

/** Client-side failure kinds that never come from the server. */
export const ClientErrorCode = {
  /** Request could not leave the device / reach the API. */
  NETWORK_UNAVAILABLE: 'NETWORK_UNAVAILABLE',
  /** Authenticated fine, but the role has no mobile experience (e.g. Admin). */
  ROLE_UNSUPPORTED: 'ROLE_UNSUPPORTED',
  UNKNOWN: 'UNKNOWN',
} as const;
export type ClientErrorCode = (typeof ClientErrorCode)[keyof typeof ClientErrorCode];

export type ErrorCode = AuthErrorCode | ClientErrorCode;

export class AuthError extends Error {
  readonly code: ErrorCode;
  readonly status?: number;

  constructor(code: ErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.status = status;
  }
}

/**
 * Why the user is sitting on the login screen. Drives which explanation we show —
 * Section 4 requires an expired session to be explained, not silently redirected.
 */
export type SignedOutReason =
  | { kind: 'initial' }
  | { kind: 'signed-out' }
  | { kind: 'session-expired' }
  | { kind: 'account-disabled' }
  | { kind: 'role-unsupported'; role: Role };

/**
 * The session's connection to the server right now.
 *
 * `unsynced` is the collector-only state: we are running on a token we could not
 * revalidate. It is deliberately distinct from `offline` — "no signal but my
 * credentials are current" and "no signal and my credentials are stale" carry
 * different urgency for someone deciding whether to keep collecting cash.
 */
export type SessionSync = 'online' | 'offline' | 'unsynced';

export type AuthState =
  | { status: 'restoring' }
  | { status: 'signedOut'; reason: SignedOutReason }
  | { status: 'authenticating' }
  | { status: 'signedIn'; session: StoredSession; role: SupportedRole; sync: SessionSync };
