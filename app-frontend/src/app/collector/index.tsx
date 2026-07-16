import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth } from '@/constants/theme';
import { SyncService } from '@/collector/services/sync-service';
import { useSession } from '@/shared/auth/auth-context';
import { Icon } from '@/shared/components/icon';
import { ListError, ListLoading, PendingSyncNotice } from '@/shared/components/list-states';
import { TwdButton } from '@/shared/components/twd-button';
import { useContentInsetsWithTopSpacing } from '@/shared/hooks/use-content-insets';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { Radius, Spacing } from '@/shared/theme/twd';

type Load = 'loading' | 'ready' | 'error';

/**
 * Home — the first thing a collector sees at the start of a shift.
 *
 * It used to be a profile page: their own name, their routes, and a sign-out
 * button. That is an odd thing to give the leftmost tab, because it answers a
 * question nobody walking a route is asking. This answers the ones they are: which
 * route am I on, is anything still stuck on this phone, and where do I start?
 * Session and sign-out moved to More, which is where you go when you are finished
 * rather than when you are starting.
 */
export default function CollectorHome() {
  const { session, sync } = useSession();
  const router = useRouter();
  const theme = useTwdTheme();
  const insets = useContentInsetsWithTopSpacing();

  const [status, setStatus] = useState<Load>('loading');
  const [counts, setCounts] = useState({ meterReadings: 0, collections: 0, serviceOrders: 0 });

  // No synchronous setState here: `status` already starts at 'loading', so the
  // mount path has nothing to set until the await resolves. Retry re-arms the
  // spinner from its own event handler, where setState is unremarkable.
  const load = useCallback(async () => {
    try {
      const s = await SyncService.getSyncStatus();
      setCounts(s.unsyncedCounts);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  const retry = useCallback(() => {
    setStatus('loading');
    void load();
  }, [load]);

  /*
   * `load` setStates only after awaiting storage, so nothing here is synchronous
   * and no cascading render occurs — the rule flags any effect calling a function
   * that contains setState and cannot see the await boundary. Reading local
   * storage on mount is the fetch-on-mount pattern the rule is aimed at, and the
   * idiomatic alternative (Suspense, or a query library) is a dependency this app
   * doesn't carry. Same pattern and same suppression in more/index.tsx.
   */
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
    void load();
  }, [load]);

  const totalUnsynced = counts.meterReadings + counts.collections + counts.serviceOrders;
  const routes = session.user.routeIds ?? [];

  return (
    <ThemedView style={styles.root}>
      <ScrollView contentContainerStyle={[styles.scroll, insets]}>
        <View style={styles.content}>
          <View style={styles.header}>
            <ThemedText type="small" themeColor="textSecondary">
              {greeting()}
            </ThemedText>
            <ThemedText type="subtitle">{firstName(session.user.name)}</ThemedText>
          </View>

          <ThemedView type="backgroundElement" style={styles.routeCard}>
            <View style={styles.routeHeader}>
              <Icon name="gauge" size={20} color={theme.primary} />
              <ThemedText type="defaultBold">Today&apos;s route</ThemedText>
            </View>
            <ThemedText type="title" style={styles.routeName} numberOfLines={2}>
              {routes.length ? routes.join(', ') : 'No route assigned'}
            </ThemedText>
            {!routes.length && (
              <ThemedText type="small" themeColor="textSecondary">
                Contact the TWD office to have a route assigned to your account.
              </ThemedText>
            )}
          </ThemedView>

          {/* Offline is a fact, not a failure — stated plainly and never in place of
              the collector's work. It sits above the actions, not over them. */}
          {sync !== 'online' && (
            <View
              style={[
                styles.offline,
                { borderColor: theme.warning, backgroundColor: theme.warningSurface },
              ]}
              accessible
              accessibilityRole="summary">
              <Icon name="cloud-off" size={20} color={theme.warning} />
              <ThemedText type="small" style={[styles.offlineText, { color: theme.warning }]}>
                Working offline. Everything you record is saved on this phone and will
                send itself when you get signal.
              </ThemedText>
            </View>
          )}

          {status === 'loading' && <ListLoading label="Checking saved work…" />}
          {status === 'error' && (
            <ListError
              title="Could not read saved work"
              body="The records on this phone could not be counted. Your work is still saved — open Sync for detail."
              onRetry={retry}
            />
          )}
          {status === 'ready' && <PendingSyncNotice count={totalUnsynced} />}

          <View style={styles.actions}>
            <TwdButton
              label="Record a reading"
              onPress={() => router.push('/collector/reading-reports')}
              accessibilityHint="Opens meter readings for your route"
            />
            <TwdButton
              label="Record a collection"
              variant="secondary"
              onPress={() => router.push('/collector/daily-collections')}
              accessibilityHint="Opens today's cash collections"
            />
          </View>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/** Route work is first-name work — the full legal name belongs on More. */
function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1, alignItems: 'center', paddingHorizontal: Spacing.four },
  content: { width: '100%', maxWidth: MaxContentWidth, gap: Spacing.four },
  header: { gap: Spacing.one },
  routeCard: { padding: Spacing.four, borderRadius: Radius.card, gap: Spacing.two },
  routeHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  // fontSize and lineHeight together — overriding only fontSize leaves `title`'s
  // 52px line box behind on a smaller glyph. That mismatch is what wrapped the
  // currency tiles into overlapping lines.
  routeName: { fontSize: 24, lineHeight: 30 },
  offline: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.card,
    borderWidth: 2,
  },
  offlineText: { flex: 1 },
  actions: { gap: Spacing.three, marginTop: Spacing.two },
});
