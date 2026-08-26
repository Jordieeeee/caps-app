import * as SecureStore from 'expo-secure-store';

import type { GoogleSession } from '@/shared/types/google-auth';

const SESSION_KEY = 'twd.google-session.v1';

/**
 * Keychain accessibility matches secure-token-store.ts exactly:
 * AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY — readable for background work while
 * locked, but excluded from iCloud Keychain backups so a session never lands
 * on a device its owner doesn't control.
 */
const KEYCHAIN_ACCESSIBLE = SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY;

/**
 * Persistence for the Google-flow session token. SecureStore (Keychain /
 * Keystore), never AsyncStorage — AsyncStorage is plaintext on disk, and this
 * value authenticates every future API call.
 *
 * A separate key from the email/password session (`twd.session.v1`) because the
 * two systems issue different shapes with different lifetimes; sharing one blob
 * would make either migration break the other. Intentionally not a React hook:
 * the API client reads it outside the component tree.
 */

/** Notified whenever the stored session changes. `null` = dropped (logout,
 * 401 cleanup, corruption) — the signal auth-context uses to force sign-out
 * from outside React, mirroring api-client's onSessionChange for the
 * password system. save() also notifies so a future rotation wires up free. */
type GoogleSessionListener = (session: GoogleSession | null) => void;
const listeners = new Set<GoogleSessionListener>();

export function onGoogleSessionChange(listener: GoogleSessionListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(session: GoogleSession | null) {
  listeners.forEach((l) => l(session));
}

async function load(): Promise<GoogleSession | null> {
  try {
    const raw = await SecureStore.getItemAsync(SESSION_KEY, {
      keychainAccessible: KEYCHAIN_ACCESSIBLE,
    });
    if (!raw) return null;
    return JSON.parse(raw) as GoogleSession;
  } catch (error) {
    // Undecryptable/corrupt blob must not brick the app — drop to signed-out.
    console.warn('[google-auth] Could not read stored session; clearing it.', error);
    await clear();
    return null;
  }
}

async function save(session: GoogleSession): Promise<void> {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session), {
    keychainAccessible: KEYCHAIN_ACCESSIBLE,
  });
  notify(session);
}

async function clear(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(SESSION_KEY, {
      keychainAccessible: KEYCHAIN_ACCESSIBLE,
    });
  } catch (error) {
    console.warn('[google-auth] Could not clear stored session.', error);
  }
  notify(null);
}

export const googleSessionStore = { load, save, clear };
