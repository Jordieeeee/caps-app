import { refreshSession } from '@/shared/services/api-client';
import { decodeAccessToken, isAccessTokenExpired, isExpiredAt } from '@/shared/services/jwt';
import { secureTokenStore } from '@/shared/services/secure-token-store';
import {
  AuthError,
  AuthErrorCode,
  ClientErrorCode,
  isSupportedRole,
  type SessionSync,
  type SignedOutReason,
  type StoredSession,
  type SupportedRole,
} from '@/shared/types/auth';

export type RestoreOutcome =
  | { kind: 'enter'; session: StoredSession; role: SupportedRole; sync: SessionSync }
  | { kind: 'signedOut'; reason: SignedOutReason };

/**
 * Session restore on app open.
 *
 * Collector and Consumer are handled by two separate functions on purpose. They
 * are not the same algorithm with a flag: a collector may enter on a credential
 * we could not revalidate, and a consumer may not, ever. Folding them together
 * is precisely how the consumer path quietly inherits offline tolerance it must
 * not have — so the split is structural, not conditional.
 */
export async function restoreSession(isOnline: boolean): Promise<RestoreOutcome> {
  const session = await secureTokenStore.load();
  if (!session) return { kind: 'signedOut', reason: { kind: 'initial' } };

  // Route on the token's own role claim — never on anything the UI chose, and
  // never on a role a caller passed in.
  const claims = decodeAccessToken(session.accessToken);
  if (!claims) {
    await secureTokenStore.clear();
    return { kind: 'signedOut', reason: { kind: 'initial' } };
  }

  if (!isSupportedRole(claims.role)) {
    // An Admin token is valid but has no mobile experience. Say so rather than
    // falling through to a default role — a silent default here would be a
    // routing decision made by omission.
    await secureTokenStore.clear();
    return { kind: 'signedOut', reason: { kind: 'role-unsupported', role: claims.role } };
  }

  // A refresh token past its expiry can never be exchanged again, online or off.
  // Both roles stop here; there is nothing left to restore.
  if (isExpiredAt(session.refreshTokenExpiresAt)) {
    await secureTokenStore.clear();
    return { kind: 'signedOut', reason: { kind: 'session-expired' } };
  }

  return claims.role === 'Collector'
    ? restoreCollectorSession(session, isOnline)
    : restoreConsumerSession(session, isOnline);
}

/**
 * Collector — offline-tolerant.
 *
 * A collector who has lost signal on a route is in an expected, routine situation,
 * and the app must not be the reason they stop working. So a cached session gets
 * them in even when we cannot revalidate it; the token's staleness is surfaced as
 * an `unsynced` indicator rather than a locked door. The server is still the one
 * enforcing what that token can actually do the moment they reconnect.
 */
async function restoreCollectorSession(
  session: StoredSession,
  isOnline: boolean
): Promise<RestoreOutcome> {
  const role: SupportedRole = 'Collector';

  if (!isOnline) {
    // No live call attempted — this is the whole point of the collector path.
    const sync: SessionSync = isAccessTokenExpired(session.accessToken) ? 'unsynced' : 'offline';
    return { kind: 'enter', session, role, sync };
  }

  if (!isAccessTokenExpired(session.accessToken)) {
    return { kind: 'enter', session, role, sync: 'online' };
  }

  // Online with a stale access token: refresh opportunistically.
  try {
    const refreshed = await refreshSession();
    return { kind: 'enter', session: refreshed, role, sync: 'online' };
  } catch (error) {
    const code = error instanceof AuthError ? error.code : ClientErrorCode.UNKNOWN;

    if (code === AuthErrorCode.ACCOUNT_DISABLED) {
      return { kind: 'signedOut', reason: { kind: 'account-disabled' } };
    }
    if (code === AuthErrorCode.REFRESH_TOKEN_INVALID) {
      return { kind: 'signedOut', reason: { kind: 'session-expired' } };
    }
    // The server was unreachable even though the OS reported connectivity —
    // captive portal, dead backend, mobile data that resolves DNS and nothing
    // else. That is a network problem, not an auth problem: let them work.
    return { kind: 'enter', session, role, sync: 'unsynced' };
  }
}

/**
 * Consumer — requires a live call, every open.
 *
 * There is no offline-first requirement here and no reason to invent one: a
 * consumer checking a bill with no signal has nothing useful to do in the app
 * anyway, since every screen they'd land on needs the server. Rather than let
 * them in to a shell of empty screens, we hold them at a clear "no connection"
 * state that can retry.
 *
 * Note what this deliberately does NOT do: it never enters on a cached token, not
 * even an unexpired one. Reaching the server on open is what lets a disabled or
 * revoked consumer account actually lose access.
 */
async function restoreConsumerSession(
  session: StoredSession,
  isOnline: boolean
): Promise<RestoreOutcome> {
  const role: SupportedRole = 'Consumer';

  if (!isOnline) {
    // Signed out, but the stored session is deliberately KEPT. The user is not
    // logged out — they are unreachable. When signal returns, restore re-runs and
    // they are back in without retyping a password. Clearing here would punish a
    // consumer for standing in a lift.
    return { kind: 'signedOut', reason: { kind: 'initial' } };
  }

  try {
    const refreshed = await refreshSession();
    return { kind: 'enter', session: refreshed, role, sync: 'online' };
  } catch (error) {
    const code = error instanceof AuthError ? error.code : ClientErrorCode.UNKNOWN;

    if (code === AuthErrorCode.ACCOUNT_DISABLED) {
      return { kind: 'signedOut', reason: { kind: 'account-disabled' } };
    }
    // Unreachable server: hold them at the no-connection state rather than
    // claiming their session expired. It has not — we just couldn't ask.
    if (code === ClientErrorCode.NETWORK_UNAVAILABLE) {
      return { kind: 'signedOut', reason: { kind: 'initial' } };
    }
    return { kind: 'signedOut', reason: { kind: 'session-expired' } };
  }
}
