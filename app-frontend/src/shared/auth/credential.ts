import { apiFetch } from '@/shared/services/api-client';

/**
 * The password a Google identity can set on itself — either role.
 *
 * Role-neutral on purpose, and it lives in shared/ for the same reason the
 * endpoint behind it is on /auth rather than under a profile: the credential
 * belongs to the `google_users` row, not to a consumer's registry record or a
 * collector's employment record. Both Account screens call this one function.
 *
 * See app-backend/models/MobileCredential.js for why the password is stored
 * against the identity rather than as a new profile document, and what breaks if
 * that is ever changed.
 */

/**
 * Whether this session may hold an app-set password, and whether it does.
 *
 * A dedicated request rather than a field on the profile, because the Password
 * screen was fetching an entire profile to draw a form. On the collector side that
 * meant resolving the scope, loading the employment record from the registry and
 * counting every meter reading ever filed — measured at ~980ms of sequential Atlas
 * round trips, all of it discarded except two booleans. This is two indexed
 * lookups, ~90ms.
 *
 * The email the form shows is not in here on purpose: both apps already hold it in
 * the session (useIdentity / useCollectorIdentity), so it needs no request at all.
 */
export async function getPasswordState(): Promise<{
  canSetPassword: boolean;
  hasPassword: boolean;
}> {
  return apiFetch('/auth/password');
}

/**
 * PUT /auth/password — set or replace it.
 *
 * `currentPassword` is required only when one is already set AND this session was
 * opened with it; a session Google vouched for can replace a forgotten password
 * without knowing it, which is the entire recovery path for this credential. The
 * server decides that, not this call.
 *
 * Deliberately returns nothing but the new state. A password change is not a
 * re-authentication: the session in hand stays valid, and swapping it here would
 * be a token rotation hidden inside a settings screen.
 */
export async function setPassword(input: {
  password: string;
  currentPassword?: string;
}): Promise<{ hasPassword: boolean }> {
  return apiFetch<{ email: string; hasPassword: boolean }>('/auth/password', {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}
