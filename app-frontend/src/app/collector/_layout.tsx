import { Redirect } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { CollectorIdentityProvider } from '@/collector/collector-identity';
import CollectorTabs from '@/collector/navigation/collector-tabs';
import { SyncService } from '@/collector/services/sync-service';
import { useAuth } from '@/shared/auth/auth-context';
import { SessionStatusBanner } from '@/shared/components/session-status-banner';
import { useConnectivity } from '@/shared/hooks/use-connectivity';

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
  const { isOnline } = useConnectivity();

  /**
   * Two ways to be a collector, and they are NOT interchangeable below.
   *
   * `passwordCollector` is the legacy session: it owns a refreshable token in
   * secureTokenStore, which is what lets it report token staleness to the
   * banner below. `googleCollector` is the allowlist grant from
   * /auth/google/callback — a single bearer token with no refresh.
   *
   * They are no longer different in what they may DO: both run the offline
   * outbox. The distinction that survives is only what each can honestly say
   * about its own session state.
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
    // BOTH collector identities, as of the collector-scope work.
    //
    // This was password-only, on the stated grounds that a Google session
    // "holds no credentials" for apiFetch. That was wrong about this codebase:
    // apiFetch (api-client.ts) falls through to googleBearerFetch whenever the
    // keychain holds no password session, and that path authenticates fine from
    // googleSessionStore. What actually broke sync for a Google collector was
    // the backend — every collector endpoint gated on the exact string
    // 'Collector' and 403'd their lowercase claim. requireCollectorScope
    // (app-backend/middleware/collector-scope.js) fixed that, so the outbox now
    // has working endpoints to drain into and this guard has nothing left to
    // protect.
    //
    // The one real difference that remains: a Google session has no refresh, so
    // a 401 is terminal and signs them out. That is the correct response to a
    // genuinely dead token, and the outbox survives it — queued readings live in
    // AsyncStorage (OfflineStorage), not in the session.
    if (!isCollector) return;
    SyncService.startSyncMonitoring();
    return () => SyncService.stopSyncMonitoring();
  }, [isCollector]);

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
    // Both identities, same reasoning as startSyncMonitoring above. It stays
    // safe for either: hydrateHistory swallows every failure and returns 0, so
    // a session that cannot authenticate leaves the phone exactly as it was.
    if (!isCollector) return;
    void SyncService.hydrateHistory();
  }, [isCollector]);

  if (!isCollector) {
    return <Redirect href="/" />;
  }

  return (
    <View style={styles.container}>
      {/* The banner has to cover both identities now that both capture work
          offline. A collector taking readings with no signal and no warning is
          the exact situation it exists for, and omitting it for Google
          collectors — correct while they had no outbox — became a silence about
          something real the moment they got one.

          The two sessions report different things, and the difference is not
          cosmetic. The password session tracks token staleness, so it can be
          'unsynced'. A Google session has no refresh and therefore no staleness
          to report: it is online or it is offline, and `sync` is derived here
          from connectivity alone rather than defaulted to something cheerful.
          See types/auth.ts — googleSignedIn carries no `sync` field, and this
          is deliberately not the place to invent one. */}
      {state.status === 'signedIn' && <SessionStatusBanner sync={state.sync} />}
      {googleCollector && <SessionStatusBanner sync={isOnline === false ? 'offline' : 'online'} />}
      {/* Identity resolves ONCE for the whole shell rather than per screen.
          Six collector screens need the same employment record, and for a
          Google collector it arrives over the network — six independent loads
          would be six spinners and six chances to disagree. */}
      <CollectorIdentityProvider>
        <View style={styles.content}>
          <CollectorTabs />
        </View>
      </CollectorIdentityProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1 },
});
