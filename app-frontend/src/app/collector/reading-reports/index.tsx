import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { RouteAccountService, type RouteAccountRow } from '@/collector/services/route-accounts';
import { timeOfDay } from '@/collector/services/today';
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
 * It is grouped by barangay because that is the unit the work is actually done in.
 * A collector is not handed "150 accounts"; they are sent to Darasa this morning
 * and Trapiche after lunch, and the paper route sheet they are replacing is one
 * sheet per barangay. So the barangay filter is the first control on the screen —
 * above reading status, which only matters once you are already somewhere.
 *
 * Rows are ordered by route sequence and never re-sorted by status. Sorting the
 * done ones to the bottom would look tidier and would also reorder a physical
 * walking path while someone is in the middle of walking it.
 */
export default function RouteAccountsScreen() {
  const router = useRouter();

  const [query, setQuery] = useState('');
  const [barangayFilter, setBarangayFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter | null>(null);

  /**
   * Pull-to-refresh forces the network; every other load is allowed to serve the
   * cache. The flag rides a ref rather than state because it must not re-create
   * `load` — `useAsync` re-runs on that identity, and a loader that changes
   * identity when you refresh it refreshes forever.
   */
  const force = useRef(false);
  const load = useCallback(async () => {
    const snapshot = await RouteAccountService.list({ force: force.current });
    force.current = false;
    return snapshot;
  }, []);

  /**
   * `refreshFailed` is deliberately not taken from the hook here. `list()` never
   * rejects while this phone holds a cached route — an unreachable server in the
   * field is the expected case, not an error — so the failure the collector needs
   * to see is reported inside the snapshot as `pullFailed` instead.
   */
  const { state, reload, refresh, refreshing } = useAsync(load);

  const onRefresh = useCallback(() => {
    force.current = true;
    return refresh();
  }, [refresh]);

  /**
   * Re-read on focus.
   *
   * Returning from the reading screen is the most common way this list goes stale
   * — the collector just changed the exact row they are about to look at. On focus
   * rather than on mount because the tab stays mounted underneath the pushed
   * screen, so mount fires once per session and never again.
   *
   * `refresh`, not `reload`: reload blanks to a skeleton, so walking back from a
   * meter would flash the whole route away and rebuild it.
   */
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const snapshot = state.status === 'ready' ? state.data : null;

  // Memoised so the identity is stable across renders — the useMemos below depend
  // on it, and a fresh [] on every render defeats all of them.
  const rows = useMemo(() => snapshot?.rows ?? [], [snapshot]);

  /**
   * Status counts describe the barangay in view, not the district.
   *
   * "Unread 7" beside a barangay chip filtered to Darasa has to mean seven meters
   * left *in Darasa*. Counting the whole route there would send someone looking
   * for four accounts that are eleven kilometres away.
   */
  const inBarangay = useMemo(
    () => (barangayFilter ? rows.filter((r) => r.barangay === barangayFilter) : rows),
    [rows, barangayFilter]
  );

  const counts = useMemo(
    () => ({
      unread: inBarangay.filter((r) => r.state === 'unread').length,
      pending: inBarangay.filter((r) => r.state === 'pending').length,
      done: inBarangay.filter((r) => r.state === 'done').length,
    }),
    [inBarangay]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inBarangay.filter((r) => {
      if (statusFilter && r.state !== statusFilter) return false;
      if (!q) return true;
      return (
        r.accountNumber.toLowerCase().includes(q) ||
        r.consumerName.toLowerCase().includes(q) ||
        r.address.toLowerCase().includes(q)
      );
    });
  }, [inBarangay, query, statusFilter]);

  /**
   * Sequence order preserved, headings inserted where the barangay changes.
   *
   * Grouping is done on the already-ordered list rather than by bucketing into a
   * map and re-emitting: the server orders the route by barangay then account
   * number, and a client-side regroup is a second opinion about walk order that
   * can disagree with the first.
   */
  const groups = useMemo(() => {
    const out: { barangay: string; accounts: RouteAccountRow[] }[] = [];
    for (const account of visible) {
      const last = out[out.length - 1];
      if (last && last.barangay === account.barangay) last.accounts.push(account);
      else out.push({ barangay: account.barangay, accounts: [account] });
    }
    return out;
  }, [visible]);

  const clearFilters = () => {
    setQuery('');
    setBarangayFilter(null);
    setStatusFilter(null);
  };

  return (
    <ScreenContainer onRefresh={onRefresh} refreshing={refreshing}>
      <ScreenHeader
        title="Route"
        subtitle={
          snapshot && rows.length > 0
            ? `${rows.length} accounts · ${snapshot.barangays.length} barangay${snapshot.barangays.length === 1 ? '' : 's'}`
            : 'Your accounts, grouped by barangay'
        }
      />

      {/* Where the list came from, stated before it is read.
          The route is cached for offline use, so a collector can be looking at
          Tuesday's roster on Friday and nothing on the screen would otherwise say
          so — including on the day the office links a new meter. */}
      {snapshot && rows.length > 0 && (
        <ScreenSection gap={Spacing.two}>
          <FreshnessNote
            syncedAt={snapshot.syncedAt}
            fromCache={snapshot.fromCache}
            pullFailed={snapshot.pullFailed}
          />
        </ScreenSection>
      )}

      <ScreenSection gap={Spacing.three}>
        <TwdTextField
          label="Find an account"
          placeholder="Account number, name or street"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          hint="Searches inside the filters below."
        />
      </ScreenSection>

      {snapshot && rows.length > 0 && (
        <ScreenSection gap={Spacing.three}>
          <FilterChips
            title="Barangay"
            chips={snapshot.barangays.map((b) => ({
              id: b.name,
              label: b.name,
              count: b.count,
            }))}
            selectedId={barangayFilter}
            onSelect={setBarangayFilter}
            allLabel="All barangays"
            allCount={rows.length}
            accessibilityLabel="Filter route by barangay"
          />

          <FilterChips
            title="Reading status"
            chips={[
              { id: 'unread', label: 'Unread', count: counts.unread },
              { id: 'pending', label: 'Pending sync', count: counts.pending },
              { id: 'done', label: 'Done', count: counts.done },
            ]}
            selectedId={statusFilter}
            onSelect={(id) => setStatusFilter(id as StatusFilter | null)}
            allLabel="All"
            allCount={inBarangay.length}
            accessibilityLabel="Filter route by reading status"
          />
        </ScreenSection>
      )}

      <ScreenSection gap={Spacing.three}>
        {state.status === 'loading' && <SkeletonList count={4} label="Loading your route" />}

        {state.status === 'error' && (
          <ListError
            title="Could not load your route"
            body="The route could not be read from this phone and TWD could not be reached. Any readings you have already recorded are still saved and will send when you have signal."
            onRetry={reload}
          />
        )}

        {snapshot && rows.length === 0 && snapshot.syncedAt === null && (
          <ListError
            title="Your route has not downloaded yet"
            body="This phone has never received the account list. Connect to the internet and pull down to try again — you need signal once before you can work offline."
            onRetry={onRefresh}
          />
        )}

        {snapshot && rows.length === 0 && snapshot.syncedAt !== null && (
          <ListEmpty
            icon="inbox"
            title="No accounts on your route"
            body="TWD sent an empty account list. Contact the office if this is not right."
          />
        )}

        {rows.length > 0 && visible.length === 0 && (
          <ListEmpty
            icon="map-pin"
            title="No accounts match"
            body="Nothing on your route matches this search and these filters."
            action={{ label: 'Clear search and filters', onPress: clearFilters }}
          />
        )}

        {groups.map((group) => (
          <View key={group.barangay} style={styles.group}>
            <BarangayHeading name={group.barangay} count={group.accounts.length} />
            {group.accounts.map((account) => (
              <AccountRow
                key={account.id}
                account={account}
                onPress={() => router.push(`/collector/reading-reports/${account.id}`)}
              />
            ))}
          </View>
        ))}
      </ScreenSection>
    </ScreenContainer>
  );
}

/**
 * How old the list is, in one line, and only when that is worth saying.
 *
 * Never a bare "Synced" — same rule as the sync screen. The app knows when it last
 * successfully pulled the route; it cannot know that the office has not changed it
 * since, so the claim is always past tense and always carries the time.
 */
function FreshnessNote({
  syncedAt,
  fromCache,
  pullFailed,
}: {
  syncedAt: number | null;
  fromCache: boolean;
  pullFailed: boolean;
}) {
  const theme = useTwdTheme();

  if (syncedAt === null) return null;

  const color = pullFailed ? theme.warning : theme.textSecondary;

  return (
    <View style={styles.freshness} accessible accessibilityRole="summary">
      <Icon name={pullFailed ? 'cloud-off' : 'refresh'} size={14} color={color} />
      <ThemedText type="small" style={{ color }}>
        {pullFailed
          ? `Could not reach TWD. Showing the route saved ${timeOfDay(syncedAt)}.`
          : fromCache
            ? `Route saved ${timeOfDay(syncedAt)}. Pull down to check for changes.`
            : `Route updated ${timeOfDay(syncedAt)}.`}
      </ThemedText>
    </View>
  );
}

function BarangayHeading({ name, count }: { name: string; count: number }) {
  const theme = useTwdTheme();

  return (
    <View style={[styles.heading, { borderBottomColor: theme.border }]}>
      <Icon name="map-pin" size={16} color={theme.primary} />
      <ThemedText type="defaultBold" style={styles.headingName} numberOfLines={1}>
        {/* "Unassigned" is the district's data problem showing through, and it is
            shown rather than hidden: an account nobody has filed under a barangay
            still has to be walked, and burying it at the bottom of an unnamed group
            is how it gets missed. */}
        {name}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {count === 1 ? '1 account' : `${count} accounts`}
      </ThemedText>
    </View>
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
  const neverRead = account.lastReadingDate === null;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Stop ${account.sequence}. ${account.consumerName}, ${account.accountNumber}, ${account.address}. ${
        neverRead ? 'No previous reading on file.' : `Previous reading ${account.previousReading}.`
      }`}
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
        {/* The name leads, the account number supports it.
            It was the other way round, which was the wrong way for the one moment
            this card exists to serve: a collector standing at a gate says a name
            out loud. The account number is what they check *once* they are at the
            meter box, so it belongs on the second line — still present, still
            searchable, no longer the headline. (And while the route was built from
            `accounts`, four stops had no consumer at all, so this line rendered the
            account number twice. See app-backend listRoute.) */}
        <View style={styles.headerText}>
          <ThemedText type="defaultBold" numberOfLines={1}>
            {account.consumerName}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {account.accountNumber}
            {account.consumerNo ? ` · ${account.consumerNo}` : ''}
          </ThemedText>
        </View>
        <ReadingStateBadge state={account.state} />
      </View>

      <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
        {account.address}
      </ThemedText>

      {/* A disconnected meter is not read, and the collector needs to know that at
          the gate rather than after climbing to the meter box. */}
      {account.status === 'inactive' && (
        <View style={styles.flag}>
          <Icon name="alert-triangle" size={14} color={theme.warning} />
          <ThemedText type="small" style={{ color: theme.warning }}>
            Account inactive — check with the office before reading
          </ThemedText>
        </View>
      )}

      {/* The one portal connection state worth translating. It is a separate fact
          from `status` above — the account is on the books, the meter is not on the
          wall yet — and it is the difference between a stop that was missed and a
          stop that could not exist. Any other value the portal invents is carried
          in the payload and left unannotated rather than guessed at. */}
      {account.connectionStatus === 'pending_installation' && (
        <View style={styles.flag}>
          <Icon name="info" size={14} color={theme.textSecondary} />
          <ThemedText type="small" themeColor="textSecondary">
            Meter not installed yet — nothing to read at this stop
          </ThemedText>
        </View>
      )}

      <View style={[styles.readingRow, { borderTopColor: theme.border }]}>
        <View style={styles.readingItem}>
          <ThemedText type="small" themeColor="textSecondary">
            Previous
          </ThemedText>
          {/* Never a "0" standing in for a number nobody has recorded. Billing
              against an assumed zero charges the consumer for the whole life of
              the meter. */}
          <ThemedText type="defaultBold" style={neverRead ? { color: theme.warning } : undefined}>
            {neverRead ? 'None on file' : account.previousReading}
          </ThemedText>
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
  freshness: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  group: { gap: Spacing.three },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingBottom: Spacing.two,
    borderBottomWidth: 1,
  },
  headingName: { flex: 1 },
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
  flag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
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
