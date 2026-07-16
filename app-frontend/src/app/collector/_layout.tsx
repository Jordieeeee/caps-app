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
  const isCollector = state.status === 'signedIn' && state.role === 'Collector';

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
    if (!isCollector) return;
    SyncService.startSyncMonitoring();
    return () => SyncService.stopSyncMonitoring();
  }, [isCollector]);

  if (!isCollector) {
    return <Redirect href="/" />;
  }

  return (
    <View style={styles.container}>
      <SessionStatusBanner sync={state.sync} />
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
