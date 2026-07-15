import * as SecureStore from 'expo-secure-store';

import type { StoredSession } from '@/shared/types/auth';

const SESSION_KEY = 'twd.session.v1';

/**
 * Keychain accessibility for the session blob.
 *
 * AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY, not the WHEN_UNLOCKED default, for two
 * reasons:
 *
 *  - AFTER_FIRST_UNLOCK lets background sync read the token while the handset is
 *    locked in a collector's pocket mid-route. WHEN_UNLOCKED would make the queue
 *    silently stall until they physically unlock the phone.
 *  - THIS_DEVICE_ONLY keeps the token out of iCloud Keychain backups, so a staff
 *    credential cannot be restored onto an unrelated personal device.
 */
const KEYCHAIN_ACCESSIBLE = SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY;

/**
 * The only place session tokens are persisted.
 *
 * Deliberately NOT AsyncStorage: AsyncStorage is unencrypted plaintext on disk
 * (a plain SQLite/file store), readable by anything with filesystem access on a
 * rooted or jailbroken handset. The collector queue in
 * src/collector/services/offline-storage.ts uses AsyncStorage and that is fine —
 * queued meter readings are not credentials. Tokens live here instead.
 *
 * This module is intentionally not a React hook: the API client must be able to
 * read and rotate tokens from outside the component tree.
 */
export const secureTokenStore = {
  async load(): Promise<StoredSession | null> {
    try {
      const raw = await SecureStore.getItemAsync(SESSION_KEY, {
        keychainAccessible: KEYCHAIN_ACCESSIBLE,
      });
      if (!raw) return null;
      return JSON.parse(raw) as StoredSession;
    } catch (error) {
      // A corrupt or undecryptable blob must not brick the app on launch. Drop it
      // and fall through to a normal signed-out state.
      console.warn('[auth] Could not read stored session; clearing it.', error);
      await secureTokenStore.clear();
      return null;
    }
  },

  async save(session: StoredSession): Promise<void> {
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session), {
      keychainAccessible: KEYCHAIN_ACCESSIBLE,
    });
  },

  async clear(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(SESSION_KEY, {
        keychainAccessible: KEYCHAIN_ACCESSIBLE,
      });
    } catch (error) {
      console.warn('[auth] Could not clear stored session.', error);
    }
  },

  isAvailableAsync: SecureStore.isAvailableAsync,
};
