import type { Role } from '@/shared/types/auth';

export interface AccessTokenClaims {
  sub: string;
  role: Role;
  name: string;
  /** Seconds since epoch. */
  exp: number;
  iat: number;
}

function base64UrlDecode(segment: string): string {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
  const withPadding = padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), '=');
  // Hermes provides atob; the payload is ASCII JSON so no UTF-8 fixup is needed
  // for the claims we read.
  return atob(withPadding);
}

/**
 * Decode (NOT verify) an access token's claims.
 *
 * There is no client-side signature check and there should not be: the device
 * has no signing key, and a client that could "validate" its own token would be
 * validating a value an attacker on that device fully controls. Every real
 * enforcement point is server-side (app-backend/middleware/auth.js). We decode
 * only to decide which UI to draw, and to read `exp` without a network round trip
 * — which is exactly what makes offline collector entry possible.
 */
export function decodeAccessToken(token: string): AccessTokenClaims | null {
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    const claims = JSON.parse(base64UrlDecode(payload)) as AccessTokenClaims;
    if (!claims.role || !claims.sub) return null;
    return claims;
  } catch {
    return null;
  }
}

/** True when the access token's own `exp` claim is in the past. */
export function isAccessTokenExpired(token: string, skewMs = 0): boolean {
  const claims = decodeAccessToken(token);
  if (!claims?.exp) return true;
  return claims.exp * 1000 - skewMs <= Date.now();
}

export function isExpiredAt(isoDate: string): boolean {
  const t = Date.parse(isoDate);
  return Number.isNaN(t) || t <= Date.now();
}
