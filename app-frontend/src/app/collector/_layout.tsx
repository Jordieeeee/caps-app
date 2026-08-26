import { Redirect } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import CollectorTabs from '@/collector/navigation/collector-tabs';
import { SyncService } from '@/collector/services/sync-service';
import { useAuth } from '@/shared/auth/auth-context';
import { SessionStatusBanner } from '@/shared/components/session-status-banner';

/**
 * Collector shell.
 *
 * The banner sits above the tabs so it is visible on every collector screen — it
 * must be persistent (a collector who missed a toast three screens ago is exactly
 * the person who needs to know their work is queued) and non-blocking (it must
 * never be the reason they stop working).
 *
 * The redirect below is defence in depth. The root layout's guard is what actually
 * routes; this catches the case where a session ends while a collector screen is
 * mounted, so we never render collector chrome without a collector session.
 */
export default function CollectorLayout() {
  const { state } = useAuth();

  /**
   * Two ways to be a collector, and they are NOT interchangeable below.
   *
   * `passwordCollector` is the legacy session: it owns a refreshable token in
   * secureTokenStore, and it is the only one the offline outbox can actually
   * use (see the sync note below). `googleCollector` is the allowlist grant
   * from /auth/google/callback.
   *
   * Both must pass the route guard. Admitting only the password session — as
   * this did — put this layout out of step with the root layout's
   * `role === 'Collector' || googleRole === 'collector'`, so an allowlisted
   * collector hit an infinite redirect between '/' and '/collector' and
   * crashed with "Maximum update depth exceeded". A guard here that is
   * stricter than the root guard is always that bug.
   */
  const passwordCollector = state.status === 'signedIn' && state.role === 'Collector';
  const googleCollector = state.status === 'googleSignedIn' && state.role === 'collector';
  const isCollector = passwordCollector || googleCollector;

  /**
   * Start opportunistic sync for the life of the collector session.
   *
   * `startSyncMonitoring` existed and was never called from anywhere, which meant
   * records left this phone only when a collector went looking for the Sync screen
   * and tapped a button — while the More screen told them "your work syncs as you
   * go". Mounted here rather than in a screen because the collector shell is the
   * only thing that lives as long as the session does; a screen-level effect would
   * stop syncing the moment they switched tabs.
   *
   * Scoped to the Collector role: a consumer session has no outbox, and the
   * consumer path is deliberately not offline-tolerant.
   */
  useEffect(() => {
    // PASSWORD collectors only, and that is a real limitation, not caution.
    // SyncService drives everything through apiFetch (api-client.ts), which
    // authenticates from secureTokenStore and refreshes password sessions. A
    // Google collector holds neither, so starting the monitor for them would
    // fire authenticated calls with no credentials, collect 401s, and — via
    // api.onSessionChange(null) in auth-context — could sign them out of a
    // perfectly good session.
    //
    // KNOWN GAP: an allowlisted Google collector therefore gets NO offline
    // outbox. They can sign in and work online, but readings taken without
    // signal are not queued or synced. Closing this means teaching the sync
    // path to authenticate from googleSessionStore; until then, collectors
    // who need offline capture must use their password account.
    if (!passwordCollector) return;
    SyncService.startSyncMonitoring();
    return () => SyncService.stopSyncMonitoring();
  }, [passwordCollector]);

  /**
   * Recover this collector's history onto a phone that does not have it.
   *
   * Runs once per collector session, here rather than on any one screen, because the
   * screens that need the records (Daily Summary, Reports) are exactly the ones that
   * would otherwise render an empty state first and fill in underneath the reader.
   *
   * It no-ops in every normal case: a phone with its own history already knows every
   * id, and a phone with unsent work is left strictly alone. The case it exists for
   * is the reinstall — see SyncService.hydrateHistory. Not awaited and not surfaced;
   * a collector who has signed in wants their route, not a progress bar about the
   * past, and `startSyncMonitoring` above must not wait on a network round trip.
   */
  useEffect(() => {
    // Password collectors only, same reason as startSyncMonitoring above:
    // hydrateHistory goes out over apiFetch, which a Google session cannot
    // authenticate.
    if (!passwordCollector) return;
    void SyncService.hydrateHistory();
  }, [passwordCollector]);

  if (!isCollector) {
    return <Redirect href="/" />;
  }

  return (
    <View style={styles.container}>
      {/* Only the password session has a `sync` value to report — the
          googleSignedIn state carries no such field (types/auth.ts). Rather
          than pass a cheerful default, the banner is omitted for Google
          collectors: nothing is tracking their sync state, and rendering
          "online" would be a claim this app cannot stand behind. */}
      {state.status === 'signedIn' && <SessionStatusBanner sync={state.sync} />}
      <View style={styles.content}>
        <CollectorTabs />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1 },
});
