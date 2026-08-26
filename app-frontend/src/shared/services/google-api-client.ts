import { API_BASE_URL } from '@/shared/services/api-client';
import { googleSessionStore } from '@/shared/services/google-session-store';
import {
  ClaimErrorCode,
  GoogleFlowError,
  isGoogleAppRole,
  type ClaimChallenge,
  type GoogleSession,
  type GoogleSignInFailure,
} from '@/shared/types/google-auth';

/**
 * HTTP surface for the Google-authenticated world.
 *
 * Kept separate from api-client.ts on purpose: that module is coupled to the
 * email/password StoredSession (access+refresh pair, rotation). This flow has a
 * single bearer token and no refresh path yet — see the 401 handling in
 * googleApiFetch for what that means and where rotation slots in later.
 */

const jsonHeaders = { 'Content-Type': 'application/json' };

/**
 * Hand the id_token straight to the backend, untouched.
 *
 * The token is opaque here by policy: nothing client-side parses its claims,
 * because anything parsed on-device can be forged on-device. The backend
 * verifies the signature against Google's keys and answers with OUR session.
 */
export async function exchangeGoogleIdToken(idToken: string): Promise<GoogleSession> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/auth/google/callback`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ idToken }),
    });
  } catch {
    throw { kind: 'network' } satisfies GoogleSignInFailure;
  }

  if (!response.ok) {
    // 401 (bad token) and 5xx (backend trouble) are deliberately the same
    // failure to the caller: the screen shows one generic message either way.
    throw { kind: 'rejected' } satisfies GoogleSignInFailure;
  }

  let body: {
    sessionToken?: unknown;
    role?: unknown;
    email?: unknown;
  };
  try {
    body = (await response.json()) as typeof body;
  } catch {
    // Non-JSON success response (proxy HTML, truncated body) — same generic
    // rejection as any other bad answer.
    throw { kind: 'rejected' } satisfies GoogleSignInFailure;
  }

  // Shape-check before persisting: a malformed body must never put a session
  // with, say, an attacker-chosen role string into the keychain. The backend
  // derives role itself; this guards transport/corruption, not the server.
  if (
    typeof body.sessionToken !== 'string' ||
    body.sessionToken.length === 0 ||
    !isGoogleAppRole(body.role) ||
    typeof body.email !== 'string'
  ) {
    throw { kind: 'rejected' } satisfies GoogleSignInFailure;
  }

  return { sessionToken: body.sessionToken, role: body.role, email: body.email };
}

/**
 * Authenticated request carrying the session token as
 * `Authorization: Bearer <token>` — mirrors api-client.apiFetch's contract for
 * feature code, minus refresh.
 *
 * On 401 the stored session is cleared and a rejected failure thrown: there is
 * no rotation behind these tokens yet, so an expired/rejected token means
 * sign-in again, full stop. When the claim/verify phase adds rotation (the
 * email/password system's RefreshToken pattern is the model), the retry hook
 * belongs between those two lines — nowhere else needs to change.
 */
export async function googleApiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = await googleSessionStore.load();
  if (!session) {
    throw new Error('You are not signed in.');
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...jsonHeaders,
      ...init.headers,
      Authorization: `Bearer ${session.sessionToken}`,
    },
  });

  if (response.status === 401) {
    await googleSessionStore.clear();
    throw new Error('Your session has expired. Please sign in again.');
  }
  if (!response.ok) {
    throw new Error('Something went wrong. Please try again.');
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/**
 * Sign out: destroy the local credential.
 *
 * There is deliberately no server call — these session tokens are stateless
 * JWTs with no revocation list yet, so "logout" cannot do more than drop the
 * credential from the device. That asymmetry is worth remembering when threat-
 * modelling: a copied token stays valid until expiry regardless of logout.
 * (Same is true of the email/password system's access tokens; its refresh
 * tokens ARE revocable server-side.)
 *
 * The store's clear() notifies listeners, which is what forces React state
 * to signed-out — no separate event here.
 */
export async function logout(): Promise<void> {
  await googleSessionStore.clear();
}

// ---------------------------------------------------------------------------
// Claim / verify flow
//
// These two endpoints run while the user holds an 'unclaimed' session. They
// get their own functions rather than riding googleApiFetch because their
// failure contract is part of the UX: each backend code maps to distinct,
// consumer-safe copy, so errors arrive typed (GoogleFlowError) with the
// backend's own generic message intact — the screens display it verbatim
// instead of re-inventing wording that could leak more than the server does.
// ---------------------------------------------------------------------------

/** Backend codes this client knows how to type. Anything else → SERVER. */
const BACKEND_CLAIM_CODES: readonly string[] = [
  ClaimErrorCode.NOT_FOUND,
  ClaimErrorCode.RATE_LIMITED,
  ClaimErrorCode.NO_MOBILE_ON_FILE,
  ClaimErrorCode.OTP_INVALID,
  ClaimErrorCode.SMS_DELIVERY_FAILED,
];

async function flowErrorFrom(response: Response): Promise<GoogleFlowError> {
  let body: { error?: unknown; code?: unknown } = {};
  try {
    body = (await response.json()) as typeof body;
  } catch {
    // Non-JSON body (proxy HTML, truncation) — fall through to SERVER below.
  }
  const rawCode = typeof body.code === 'string' ? body.code : '';
  const code = (BACKEND_CLAIM_CODES as readonly string[]).includes(rawCode)
    ? (rawCode as ClaimErrorCode)
    : ClaimErrorCode.SERVER;
  const message =
    // Backend messages on these endpoints are written for direct display —
    // use them verbatim rather than paraphrasing into something less careful.
    typeof body.error === 'string' && body.error.length > 0
      ? body.error
      : 'Something went wrong. Please try again.';
  return new GoogleFlowError(code, message, response.status);
}

async function bearerToken(): Promise<string> {
  const session = await googleSessionStore.load();
  if (!session) {
    throw new GoogleFlowError(
      ClaimErrorCode.SERVER,
      'Your session has expired. Please sign in again.',
      401
    );
  }
  return session.sessionToken;
}

/**
 * POST /consumer/claim-account — ask for an OTP at the registry number.
 * Respects the account-number normalisation the backend performs by sending
 * the trimmed value only.
 */
export async function claimAccount(accountNumber: string): Promise<ClaimChallenge> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/consumer/claim-account`, {
      method: 'POST',
      headers: { ...jsonHeaders, Authorization: `Bearer ${await bearerToken()}` },
      body: JSON.stringify({ accountNumber: accountNumber.trim() }),
    });
  } catch {
    throw new GoogleFlowError(
      ClaimErrorCode.NETWORK,
      'Cannot reach the TWD server. Check your connection and try again.'
    );
  }
  if (!response.ok) throw await flowErrorFrom(response);

  let body: { challenge?: unknown; maskedNumber?: unknown };
  try {
    body = (await response.json()) as typeof body;
  } catch {
    throw new GoogleFlowError(
      ClaimErrorCode.SERVER,
      'Something went wrong. Please try again.',
      response.status
    );
  }
  if (body.challenge !== 'otp' || typeof body.maskedNumber !== 'string') {
    throw new GoogleFlowError(
      ClaimErrorCode.SERVER,
      'Something went wrong. Please try again.',
      response.status
    );
  }
  return { challenge: 'otp', maskedNumber: body.maskedNumber };
}

/**
 * POST /consumer/verify-claim — exchange the code for a promoted session.
 *
 * Returns the NEW session ({sessionToken, role:'consumer', email}) but does
 * NOT persist it: swapping credentials is a state-machine act (store + context
 * must move together), and that belongs to the caller — auth-context's
 * updateGoogleRole. A malformed success body is treated like any other
 * rejection; nothing half-valid is ever handed up.
 */
export async function verifyClaimCode(
  accountNumber: string,
  code: string
): Promise<GoogleSession> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/consumer/verify-claim`, {
      method: 'POST',
      headers: { ...jsonHeaders, Authorization: `Bearer ${await bearerToken()}` },
      body: JSON.stringify({ accountNumber: accountNumber.trim(), code: code.trim() }),
    });
  } catch {
    throw new GoogleFlowError(
      ClaimErrorCode.NETWORK,
      'Cannot reach the TWD server. Check your connection and try again.'
    );
  }
  if (!response.ok) throw await flowErrorFrom(response);

  let body: { sessionToken?: unknown; role?: unknown; email?: unknown };
  try {
    body = (await response.json()) as typeof body;
  } catch {
    throw new GoogleFlowError(ClaimErrorCode.SERVER, 'Something went wrong. Please try again.');
  }
  if (
    typeof body.sessionToken !== 'string' ||
    body.sessionToken.length === 0 ||
    !isGoogleAppRole(body.role) ||
    typeof body.email !== 'string'
  ) {
    throw new GoogleFlowError(ClaimErrorCode.SERVER, 'Something went wrong. Please try again.');
  }
  return { sessionToken: body.sessionToken, role: body.role, email: body.email };
}
