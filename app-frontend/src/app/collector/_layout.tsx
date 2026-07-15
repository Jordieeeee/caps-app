import { Redirect } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import CollectorTabs from '@/collector/navigation/collector-tabs';
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

  if (state.status !== 'signedIn' || state.role !== 'Collector') {
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
