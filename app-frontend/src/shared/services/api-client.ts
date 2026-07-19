import Constants from 'expo-constants';

import { secureTokenStore } from '@/shared/services/secure-token-store';
import { isAccessTokenExpired } from '@/shared/services/jwt';
import {
  AuthError,
  AuthErrorCode,
  ClientErrorCode,
  type ErrorCode,
  type StoredSession,
} from '@/shared/types/auth';

const API_BASE_URL: string =
  (Constants.expoConfig?.extra?.apiBaseUrl as string) ??
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  'http://localhost:5000/api';

/** Refresh this far ahead of expiry so a request doesn't die mid-flight. */
const REFRESH_SKEW_MS = 30_000;

interface ApiErrorBody {
  error?: string;
  code?: string;
}

/** Listeners notified when the session is rotated or dropped from outside React. */
type SessionListener = (session: StoredSession | null) => void;
const listeners = new Set<SessionListener>();

export function onSessionChange(listener: SessionListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(session: StoredSession | null) {
  listeners.forEach((l) => l(session));
}

async function parseError(response: Response): Promise<AuthError> {
  let body: ApiErrorBody = {};
  try {
    body = (await response.json()) as ApiErrorBody;
  } catch {
    // Non-JSON error body (proxy/gateway HTML, etc.) — fall through to defaults.
  }
  const code = (body.code as ErrorCode | undefined) ?? ClientErrorCode.UNKNOWN;
  return new AuthError(code, body.error ?? 'Something went wrong.', response.status);
}

/** A fetch that reports unreachable-network as a typed error instead of a raw TypeError. */
async function rawFetch(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(`${API_BASE_URL}${path}`, init);
  } catch {
    throw new AuthError(
      ClientErrorCode.NETWORK_UNAVAILABLE,
      'Cannot reach the TWD server. Check your connection and try again.'
    );
  }
}

const jsonHeaders = { 'Content-Type': 'application/json' };

export async function login(email: string, password: string): Promise<StoredSession> {
  const response = await rawFetch('/auth/login', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
  });
  if (!response.ok) throw await parseError(response);
  return normalizeSession(await response.json());
}

export async function register(
  name: string,
  email: string,
  password: string
): Promise<StoredSession> {
  const response = await rawFetch('/auth/register', {
    method: 'POST',
    headers: jsonHeaders,
    // No `role`: this endpoint only ever creates Consumers, by design. Sending one
    // would be ignored server-side anyway.
    body: JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase(), password }),
  });
  if (!response.ok) throw await parseError(response);
  return normalizeSession(await response.json());
}

function normalizeSession(body: any): StoredSession {
  return {
    accessToken: body.accessToken,
    refreshToken: body.refreshToken,
    accessTokenExpiresAt: body.accessTokenExpiresAt,
    refreshTokenExpiresAt: body.refreshTokenExpiresAt,
    user: {
      id: body.user._id ?? body.user.id,
      name: body.user.name,
      email: body.user.email,
      role: body.user.role,
      status: body.user.status ?? 'active',
      routeIds: body.user.routeIds ?? [],
      accountNumbers: body.user.accountNumbers ?? [],
      employeeId: body.user.employeeId,
      zone: body.user.zone,
      phone: body.user.phone,
      dateHired: body.user.dateHired,
    },
  };
}

/**
 * In-flight refresh, shared by all callers.
 *
 * This must be a single promise. The moment a collector regains signal, the sync
 * queue can fire a burst of requests that all see an expired token at once. With
 * rotation on the server, the first refresh invalidates the token the others are
 * still holding — they would replay it, trip the backend's reuse detection, and
 * revoke the collector's whole session in the middle of a route. Collapsing them
 * onto one promise is what prevents that.
 */
let inFlightRefresh: Promise<StoredSession> | null = null;

/**
 * Refresh the session, rotating the token.
 *
 * Takes no token argument by design: it reads the current one from the keychain
 * itself. Letting callers pass a token they captured earlier invites replaying a
 * token that has already been rotated — and the server treats a replayed rotated
 * token as theft and revokes every session the user has. A caller holding stale
 * state in a closure or a React value would therefore be able to sign a collector
 * out mid-route. Reading it here means there is only ever one source for it.
 */
export function refreshSession(): Promise<StoredSession> {
  if (inFlightRefresh) return inFlightRefresh;

  inFlightRefresh = (async () => {
    try {
      const current = await secureTokenStore.load();
      if (!current) {
        throw new AuthError(
          AuthErrorCode.REFRESH_TOKEN_INVALID,
          'Your session has ended. Please sign in again.',
          401
        );
      }

      const response = await rawFetch('/auth/refresh', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ refreshToken: current.refreshToken }),
      });
      if (!response.ok) {
        const error = await parseError(response);
        // The refresh token is genuinely dead — drop it so we don't retry a
        // credential that can never work again. A network failure, by contrast,
        // must leave the stored session intact: that is the collector's way back in.
        if (
          error.code === AuthErrorCode.REFRESH_TOKEN_INVALID ||
          error.code === AuthErrorCode.ACCOUNT_DISABLED
        ) {
          await secureTokenStore.clear();
          emit(null);
        }
        throw error;
      }
      const session = normalizeSession(await response.json());
      await secureTokenStore.save(session);
      emit(session);
      return session;
    } finally {
      inFlightRefresh = null;
    }
  })();

  return inFlightRefresh;
}

export async function logout(refreshToken: string): Promise<void> {
  try {
    await rawFetch('/auth/logout', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    // Best-effort. Failing to tell the server we logged out must never block
    // clearing local state — the user asked to be signed out.
  }
}

/**
 * Authenticated request with transparent refresh.
 *
 * Used by feature code (billing, sync, …), not by the auth screens themselves.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  let session = await secureTokenStore.load();
  if (!session) {
    throw new AuthError(AuthErrorCode.TOKEN_EXPIRED, 'You are not signed in.', 401);
  }

  if (isAccessTokenExpired(session.accessToken, REFRESH_SKEW_MS)) {
    session = await refreshSession();
  }

  const send = (token: string) =>
    rawFetch(path, {
      ...init,
      headers: { ...jsonHeaders, ...init.headers, Authorization: `Bearer ${token}` },
    });

  let response = await send(session.accessToken);

  // The server may still reject it — clock skew, or a token revoked since we last
  // looked. One retry after a forced refresh, then give up.
  if (response.status === 401) {
    const refreshed = await refreshSession();
    response = await send(refreshed.accessToken);
  }

  if (!response.ok) throw await parseError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export { API_BASE_URL };
