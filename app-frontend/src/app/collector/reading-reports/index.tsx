import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { RouteAccountService, type RouteAccountRow } from '@/collector/services/route-accounts';
import { FilterChips } from '@/shared/components/filter-chips';
import { Icon } from '@/shared/components/icon';
import { ListEmpty, ListError } from '@/shared/components/list-states';
import { ScreenContainer, ScreenSection } from '@/shared/components/screen-container';
import { ScreenHeader } from '@/shared/components/screen-header';
import { SkeletonList } from '@/shared/components/skeleton';
import { ReadingStateBadge } from '@/shared/components/status-badge';
import { TwdTextField } from '@/shared/components/twd-text-field';
import { useAsync } from '@/shared/hooks/use-async';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { MIN_TAP_TARGET, Radius, Spacing } from '@/shared/theme/twd';

type StatusFilter = 'unread' | 'pending' | 'done';

/**
 * The route — the collector's actual working screen.
 *
 * This replaced a "Readings" screen that listed readings already taken. That is a
 * report of work already done, not the work: a collector opening the app at 7am
 * with twelve meters to walk saw a list of things they had already finished and
 * nothing telling them where to go next. The list now enumerates the *route*, in
 * walk order, and a row leaves "Unread" by being read.
 *
 * Rows are ordered by route sequence and never re-sorted by status. Sorting the
 * done ones to the bottom would look tidier and would also reorder a physical
 * walking path while someone is in the middle of walking it.
 */
export default function RouteAccountsScreen() {
  const router = useRouter();

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter | null>(null);

  const { state, reload } = useAsync(useCallback(() => RouteAccountService.list(), []));

  /**
   * Re-read on focus.
   *
   * Returning from the reading screen is the most common way this list goes stale
   * — the collector just changed the exact row they are about to look at. On focus
   * rather than on mount because the tab stays mounted underneath the pushed
   * screen, so mount fires once per session and never again.
   */
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  // Memoised so the identity is stable across renders — the two useMemos below
  // depend on it, and a fresh [] on every render defeats both of them.
  const rows = useMemo(
    () => (state.status === 'ready' ? state.data : []),
    [state]
  );

  const counts = useMemo(
    () => ({
      unread: rows.filter((r) => r.state === 'unread').length,
      pending: rows.filter((r) => r.state === 'pending').length,
      done: rows.filter((r) => r.state === 'done').length,
    }),
    [rows]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter && r.state !== statusFilter) return false;
      if (!q) return true;
      return r.accountNumber.toLowerCase().includes(q) || r.consumerName.toLowerCase().includes(q);
    });
  }, [rows, query, statusFilter]);

  return (
    <ScreenContainer>
      <ScreenHeader title="Route" subtitle="Your assigned accounts, in walk order" />

      <ScreenSection gap={Spacing.three}>
        <TwdTextField
          label="Find an account"
          placeholder="Account number or name"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          hint="Search the route without scrolling it."
        />
      </ScreenSection>

      <ScreenSection gap={0}>
        <FilterChips
          chips={[
            { id: 'unread', label: `Unread (${counts.unread})` },
            { id: 'pending', label: `Pending sync (${counts.pending})` },
            { id: 'done', label: `Done (${counts.done})` },
          ]}
          selectedId={statusFilter}
          onSelect={(id) => setStatusFilter(id as StatusFilter | null)}
          allLabel={`All (${rows.length})`}
          accessibilityLabel="Filter route by reading status"
        />
      </ScreenSection>

      <ScreenSection gap={Spacing.three}>
        {state.status === 'loading' && <SkeletonList count={4} label="Loading your route" />}

        {state.status === 'error' && (
          <ListError
            title="Could not load your route"
            body="The route saved on this phone could not be read. Any readings you have already recorded are still saved."
            onRetry={reload}
          />
        )}

        {state.status === 'ready' && rows.length === 0 && (
          <ListEmpty
            icon="inbox"
            title="No accounts assigned to your route"
            body="Your route is pre-loaded while you have signal. Contact the TWD office if this stays empty."
          />
        )}

        {state.status === 'ready' && rows.length > 0 && visible.length === 0 && (
          <ListEmpty
            icon="gauge"
            title="No accounts match"
            body="Nothing on your route matches this search and filter."
            action={{
              label: 'Clear search and filter',
              onPress: () => {
                setQuery('');
                setStatusFilter(null);
              },
            }}
          />
        )}

        {visible.map((account) => (
          <AccountRow
            key={account.id}
            account={account}
            onPress={() => router.push(`/collector/reading-reports/${account.id}`)}
          />
        ))}
      </ScreenSection>
    </ScreenContainer>
  );
}

/**
 * One address on the route.
 *
 * The whole card is the tap target rather than a trailing chevron — this gets
 * tapped one-handed, outdoors, sometimes in the rain, and a 44pt chevron inside a
 * 96pt card throws away the other 90% of a perfectly good target.
 */
function AccountRow({ account, onPress }: { account: RouteAccountRow; onPress: () => void }) {
  const theme = useTwdTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Stop ${account.sequence}. ${account.accountNumber}, ${account.consumerName}, ${account.address}. Previous reading ${account.previousReading}.`}
      accessibilityHint="Opens meter reading entry for this account"
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
          borderColor: theme.border,
        },
      ]}>
      <View style={styles.cardHeader}>
        {/* Walk order, stated plainly. The paper route sheet is numbered; so is
            this. */}
        <View style={[styles.sequence, { borderColor: theme.border }]}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            {account.sequence}
          </ThemedText>
        </View>
        <View style={styles.headerText}>
          <ThemedText type="defaultBold" numberOfLines={1}>
            {account.accountNumber}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {account.consumerName}
          </ThemedText>
        </View>
        <ReadingStateBadge state={account.state} />
      </View>

      <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
        {account.address}
      </ThemedText>

      <View style={[styles.readingRow, { borderTopColor: theme.border }]}>
        <View style={styles.readingItem}>
          <ThemedText type="small" themeColor="textSecondary">
            Previous
          </ThemedText>
          <ThemedText type="defaultBold">{account.previousReading}</ThemedText>
        </View>
        {account.currentReading !== undefined ? (
          <>
            <View style={styles.readingItem}>
              <ThemedText type="small" themeColor="textSecondary">
                Current
              </ThemedText>
              <ThemedText type="defaultBold">{account.currentReading}</ThemedText>
            </View>
            <View style={styles.readingItem}>
              <ThemedText type="small" themeColor="textSecondary">
                Used
              </ThemedText>
              <ThemedText type="defaultBold">{account.consumption} m³</ThemedText>
            </View>
          </>
        ) : (
          <View style={styles.pendingHint}>
            <Icon name="chevron-right" size={16} color={theme.textSecondary} />
            <ThemedText type="small" themeColor="textSecondary">
              Tap to read meter
            </ThemedText>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.card,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  sequence: {
    minWidth: 28,
    height: 28,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1 },
  readingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
    borderTopWidth: 1,
    paddingTop: Spacing.two,
    minHeight: MIN_TAP_TARGET - Spacing.four,
  },
  readingItem: { gap: Spacing.half },
  pendingHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
});
