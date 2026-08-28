import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  StyleSheet,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TwdButton } from '@/shared/components/twd-button';
import { TwdLink } from '@/shared/components/twd-link';
import { TwdTextField } from '@/shared/components/twd-text-field';
import * as api from '@/shared/services/api-client';
import { API_BASE_URL } from '@/shared/services/api-client';
import { Spacing } from '@/shared/theme/twd';
import { AuthError, AuthErrorCode } from '@/shared/types/auth';

/**
 * Collector allowlist management — INTERNAL TOOL, function over form.
 *
 * Authentication is deliberately NOT the app's session systems. Admin portal
 * accounts have no mobile session by design (adopt() rejects them outright),
 * and google-flow roles must never gain user-management powers. So this
 * screen logs into the portal endpoint directly and holds the resulting
 * access token IN COMPONENT MEMORY ONLY:
 *
 *   - never SecureStore / AsyncStorage,
 *   - never passed to auth-context,
 *   - gone on unmount, force-killed by the "Done" action.
 *
 * Consequence worth understanding: every visit re-types credentials. That is
 * the cost of not building a second persistent identity system into the app,
 * and for an office-only tool used a few times a month it is the right side
 * of the trade.
 *
 * Not linked from anywhere in the UI on purpose — reach it by route
 * (/admin-allowlist). It draws nothing that says "tap here" to consumers.
 */

interface AllowlistEntry {
  id: string;
  email: string;
  createdAt: string;
  addedByEmail: string | null;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** Minimal bearer client for this screen alone. 401 always means "log in
 * again": these tokens are short-lived portal access tokens with no refresh
 * here, by design. */
async function adminFetch<T>(
  token: string,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { ...JSON_HEADERS, ...init.headers, Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new Error('Cannot reach the TWD server. Check your connection and try again.');
  }
  if (response.status === 401) {
    throw new AuthError(
      AuthErrorCode.TOKEN_EXPIRED,
      'Your session has expired. Please sign in again.',
      401
    );
  }
  if (!response.ok) {
    let message = 'Something went wrong. Please try again.';
    try {
      const body = (await response.json()) as { error?: unknown };
      if (typeof body.error === 'string' && body.error.length > 0) message = body.error;
    } catch {
      // keep default message
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}

export default function AdminAllowlistScreen() {
  /** Memory-only credential. `null` = show the login phase. */
  const [token, setToken] = useState<string | null>(null);

  return (
    <ThemedView style={styles.root}>
      {token ? (
        <ManagePhase token={token} onSessionEnded={() => setToken(null)} />
      ) : (
        <LoginPhase onAuthenticated={setToken} />
      )}
    </ThemedView>
  );
}

function LoginPhase({ onAuthenticated }: { onAuthenticated: (t: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function attemptLogin() {
    setError(null);
    if (!email.trim() || !password) {
      setError('Enter your TWD office credentials.');
      return;
    }
    setBusy(true);
    try {
      // Deliberately NOT ctx.signIn(): that persists to the keychain and
      // adopts the role into the app's state machine — both forbidden here.
      // We want exactly one thing: an in-memory access token.
      const result = await api.login(email, password);
      // An Admin always authenticates through the password system. A `google`
      // result here means the credentials belong to a consumer who set their own
      // password (api-client's LoginResult) — correct credentials, wrong door,
      // and there is no access token behind them to manage an allowlist with.
      if (result.kind !== 'password') {
        setError('These are not office credentials.');
        return;
      }
      onAuthenticated(result.session.accessToken);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.loginWrap}>
      <ThemedText type="subtitle">TWD staff sign-in</ThemedText>
      <ThemedText themeColor="textSecondary">
        Collector allowlist management. Office credentials only.
      </ThemedText>
      {error && <ThemedText type="small">{error}</ThemedText>}
      <TwdTextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        editable={!busy}
      />
      <TwdTextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        editable={!busy}
        returnKeyType="go"
        onSubmitEditing={() => void attemptLogin()}
      />
      <TwdButton
        label="Sign in"
        busyLabel="Signing in…"
        busy={busy}
        onPress={() => void attemptLogin()}
      />
    </View>
  );
}

function ManagePhase({
  token,
  onSessionEnded,
}: {
  token: string;
  onSessionEnded: () => void;
}) {
  const [entries, setEntries] = useState<AllowlistEntry[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Starts true: the mount effect below kicks off the first load. refetch()
  // itself performs NO synchronous setState — it is called from an effect,
  // where sync setState is a cascading-render hazard (compiler-era lint).
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    try {
      const body = await adminFetch<{ entries: AllowlistEntry[] }>(
        token,
        '/admin/collector-allowlist'
      );
      setEntries(body.entries);
      setError(null);
    } catch (e) {
      if (e instanceof AuthError && e.code === AuthErrorCode.TOKEN_EXPIRED) {
        onSessionEnded();
        return;
      }
      setError(e instanceof Error ? e.message : 'Could not load the allowlist.');
    } finally {
      setLoading(false);
    }
  }, [token, onSessionEnded]);

  useEffect(() => {
    // Deferred one tick: the compiler-era lint correctly refuses synchronous
    // setState from effect bodies, and refetch() always ends in setState. The
    // first frame simply shows the loading state, which is what it is for.
    const t = setTimeout(() => void refetch(), 0);
    return () => clearTimeout(t);
  }, [refetch]);

  /** Pull-to-refresh: event context, so showing the spinner synchronously is fine. */
  const refresh = useCallback(() => {
    setLoading(true);
    void refetch();
  }, [refetch]);

  async function addEntry() {
    const email = newEmail.trim().toLowerCase();
    if (!email) return;
    setBusy(true);
    setError(null);
    try {
      await adminFetch(token, '/admin/collector-allowlist', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setNewEmail('');
      await refetch();
    } catch (e) {
      if (e instanceof AuthError && e.code === AuthErrorCode.TOKEN_EXPIRED) {
        onSessionEnded();
        return;
      }
      setError(e instanceof Error ? e.message : 'Could not add that email.');
    } finally {
      setBusy(false);
    }
  }

  function confirmRemove(entry: AllowlistEntry) {
    Alert.alert('Remove collector', `Remove ${entry.email} from the allowlist?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void removeEntry(entry) },
    ]);
  }

  async function removeEntry(entry: AllowlistEntry) {
    setBusy(true);
    setError(null);
    try {
      await adminFetch(token, `/admin/collector-allowlist/${encodeURIComponent(entry.email)}`, {
        method: 'DELETE',
      });
      await refetch();
    } catch (e) {
      if (e instanceof AuthError && e.code === AuthErrorCode.TOKEN_EXPIRED) {
        onSessionEnded();
        return;
      }
      setError(e instanceof Error ? e.message : 'Could not remove that entry.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.manageWrap}>
      <ThemedText type="subtitle">Collector allowlist</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Emails here may sign in to the collector app with Google. Removal is immediate at next
        sign-in.
      </ThemedText>

      {error && <ThemedText type="small">{error}</ThemedText>}

      <View style={styles.addRow}>
        <View style={styles.addField}>
          <TwdTextField
            label="New collector email"
            value={newEmail}
            onChangeText={setNewEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            onSubmitEditing={() => void addEntry()}
          />
        </View>
        <TwdButton label="Add collector" busy={busy} onPress={() => void addEntry()} />
      </View>

      <FlatList
        showsVerticalScrollIndicator={false}
        data={entries}
        keyExtractor={(item) => item.id}
        refreshing={loading}
        onRefresh={refresh}
        ItemSeparatorComponent={Separator}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowText}>
              <ThemedText type="defaultBold">{item.email}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Added{item.addedByEmail ? ` by ${item.addedByEmail}` : ''}
              </ThemedText>
            </View>
            <TwdLink label="Remove" onPress={() => confirmRemove(item)} disabled={busy} />
          </View>
        )}
        ListEmptyComponent={
          loading ? null : (
            <ThemedText themeColor="textSecondary">No active entries.</ThemedText>
          )
        }
      />

      <TwdButton label="Done" onPress={onSessionEnded} style={styles.done} />
    </View>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loginWrap: {
    flex: 1,
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  manageWrap: {
    flex: 1,
    gap: Spacing.three,
    padding: Spacing.four,
  },
  addRow: { gap: Spacing.two },
  addField: { flexGrow: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.two,
  },
  rowText: { gap: 2, flexShrink: 1 },
  separator: { height: StyleSheet.hairlineWidth },
  done: { marginTop: Spacing.two },
});
