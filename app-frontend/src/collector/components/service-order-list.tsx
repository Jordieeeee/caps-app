import { useRouter } from 'expo-router';
import { useCallback, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useRefreshOnChange } from '@/collector/hooks/use-refresh-on-change';
import { ServiceOrderService, type ServiceOrderRow } from '@/collector/services/service-orders';
import { timeOfDay } from '@/collector/services/today';
import { Icon } from '@/shared/components/icon';
import { ListEmpty, ListError } from '@/shared/components/list-states';
import { ScreenContainer, ScreenSection } from '@/shared/components/screen-container';
import { SkeletonList } from '@/shared/components/skeleton';
import { ServiceOrderBadge, SyncBadge } from '@/shared/components/status-badge';
import { formatPeso } from '@/shared/format/currency';
import { useAsync } from '@/shared/hooks/use-async';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { Radius, Spacing } from '@/shared/theme/twd';
import type { NoticeKind } from '@/shared/utils/billing-calculator';

const COPY = {
  reconnection: {
    route: 'reconnections',
    emptyTitle: 'No pending reconnections',
    emptyBody:
      'Reconnection orders assigned to you appear here, including while you are offline.',
    doneTitle: 'Reconnected today',
    cancelledTitle: 'Cancelled by the office',
    balanceLabel: 'Settled',
    icon: 'file-check',
  },
  disconnection: {
    route: 'disconnections',
    emptyTitle: 'No pending disconnections',
    emptyBody:
      'Disconnection orders authorised by the office appear here, including while you are offline.',
    doneTitle: 'Disconnected today',
    cancelledTitle: 'Cancelled by the office',
    balanceLabel: 'Outstanding',
    icon: 'alert-triangle',
  },
} as const;

/**
 * The pending-work list for one kind of service order.
 *
 * One component for both flows. They differ in wording and in which balance
 * matters — a reconnection is justified by what was *settled*, a disconnection by
 * what is still *owed* — and in nothing else, so the difference lives in COPY
 * rather than in a second file that drifts.
 *
 * Pending orders come first and completed ones sit underneath: unlike the meter
 * route, these have no walk order to preserve, and what the collector wants is the
 * next gate to visit.
 */
export function ServiceOrderList({ kind }: { kind: NoticeKind }) {
  const router = useRouter();
  const copy = COPY[kind];

  /**
   * Pull-to-refresh forces the network; every other load may serve the cache. The
   * flag rides a ref rather than state because it must not re-create `load` —
   * `useAsync` re-runs on that identity, and a loader that changes identity when
   * you refresh it refreshes forever. Same shape as the route list.
   */
  const force = useRef(false);
  const load = useCallback(async () => {
    const snapshot = await ServiceOrderService.list(kind, { force: force.current });
    force.current = false;
    return snapshot;
  }, [kind]);

  const { state, reload, refresh, refreshing } = useAsync(load);

  const onRefresh = useCallback(() => {
    force.current = true;
    return refresh();
  }, [refresh]);

  /**
   * Refresh on return only when something was actually written.
   *
   * `refresh`, not `reload`: returning from a confirmation is the common way this
   * list goes stale, and reload blanks to a skeleton — so walking back from a gate
   * would flash the whole list away and rebuild it. But it used to run on EVERY
   * focus, which meant a spinner over unchanged rows every time the collector
   * tapped this tab. useRefreshOnChange keeps the confirmation case and drops the
   * rest.
   */
  useRefreshOnChange(refresh);

  const snapshot = state.status === 'ready' ? state.data : null;
  const rows = snapshot?.rows ?? [];
  const pending = rows.filter((r) => r.state === 'pending');
  const completed = rows.filter((r) => r.state === 'done' || r.state === 'pending-sync');
  /**
   * Withdrawn orders get their own section rather than joining the completed pile.
   * They are neither done nor to do, and the one thing a collector must not read
   * them as is work — which is exactly what they looked like before, sitting
   * untitled among the pending rows with a chevron on them.
   */
  const cancelled = rows.filter((r) => r.state === 'cancelled');

  const open = (order: ServiceOrderRow) =>
    router.push(`/collector/reading-reports/${copy.route}/${order.id}`);

  return (
    <ScreenContainer variant="stack" onRefresh={onRefresh} refreshing={refreshing}>
      {snapshot && (
        <ScreenSection gap={Spacing.two}>
          <Freshness
            syncedAt={snapshot.syncedAt}
            fromCache={snapshot.fromCache}
            pullFailed={snapshot.pullFailed}
          />
        </ScreenSection>
      )}

      <ScreenSection gap={Spacing.three}>
        {state.status === 'loading' && <SkeletonList count={3} label="Loading orders" />}

        {state.status === 'error' && (
          <ListError
            title="Could not load orders"
            body="The orders saved on this phone could not be read. Any work you have already confirmed is still saved."
            onRetry={reload}
          />
        )}

        {/* Never downloaded is its own case. An empty list and a list that has
            never arrived look identical and mean opposite things: one says the
            office has raised nothing for you, the other says this phone has not
            asked yet — and only the second is fixed by finding signal. */}
        {snapshot && rows.length === 0 && snapshot.syncedAt === null && (
          <ListError
            title="Orders have not downloaded yet"
            body="This phone has never received the order list. Connect to the internet and pull down to try again."
            onRetry={onRefresh}
          />
        )}

        {snapshot && pending.length === 0 && snapshot.syncedAt !== null && (
          <ListEmpty icon={copy.icon} title={copy.emptyTitle} body={copy.emptyBody} />
        )}

        {pending.map((order) => (
          <OrderRow
            key={order.id}
            order={order}
            balanceLabel={copy.balanceLabel}
            onPress={() => open(order)}
          />
        ))}
      </ScreenSection>

      {completed.length > 0 && (
        <ScreenSection gap={Spacing.three}>
          <ThemedText type="defaultBold">{copy.doneTitle}</ThemedText>
          {completed.map((order) => (
            <OrderRow
              key={order.id}
              order={order}
              balanceLabel={copy.balanceLabel}
              onPress={() => open(order)}
            />
          ))}
        </ScreenSection>
      )}

      {cancelled.length > 0 && (
        <ScreenSection gap={Spacing.three}>
          <ThemedText type="defaultBold">{copy.cancelledTitle}</ThemedText>
          {cancelled.map((order) => (
            <OrderRow
              key={order.id}
              order={order}
              balanceLabel={copy.balanceLabel}
              onPress={() => open(order)}
            />
          ))}
        </ScreenSection>
      )}
    </ScreenContainer>
  );
}

/**
 * How old this list is, in one line — same rule as the route screen.
 *
 * Never a bare "Synced". The app knows when it last pulled the office's orders; it
 * cannot know the office has not raised one since, so the claim is past tense and
 * carries the time. On this screen that matters more than on the route: a
 * disconnection order raised this morning is exactly the kind of thing a stale list
 * is missing.
 */
function Freshness({
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
          ? `Could not reach TWD. Showing the orders saved ${timeOfDay(syncedAt)}.`
          : fromCache
            ? `Orders saved ${timeOfDay(syncedAt)}. Pull down to check for new ones.`
            : `Orders updated ${timeOfDay(syncedAt)}.`}
      </ThemedText>
    </View>
  );
}

function OrderRow({
  order,
  balanceLabel,
  onPress,
}: {
  order: ServiceOrderRow;
  balanceLabel: string;
  onPress: () => void;
}) {
  const theme = useTwdTheme();
  /**
   * Each kind reads its OWN figure — never the other's.
   *
   * This was `settledAmount ?? outstandingBalance`, which was safe only while
   * nothing populated either. Now that the server attaches a real outstanding
   * balance, that fallback would render it on a reconnection card under the label
   * "Settled" — telling a collector that a household who has just paid settled the
   * amount they still owe. A reconnection shows what was settled or it shows
   * nothing.
   *
   * Undefined is still not zero: `formatPeso(undefined)` prints ₱0.00, which on a
   * disconnection card is a statement that the consumer owes nothing. The row is
   * dropped instead.
   */
  const settled = order.kind === 'reconnection';
  const amount = settled ? order.settledAmount : order.outstandingBalance;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${order.accountNumber}, ${order.consumerName}, ${order.address}.${
        amount === undefined ? '' : ` ${balanceLabel} ${formatPeso(amount)}.`
      } Order ${order.id}.`}
      accessibilityHint={
        order.state === 'pending'
          ? 'Opens confirmation for this order'
          : order.state === 'cancelled'
            ? 'Opens this cancelled order'
            : 'Opens this completed order'
      }
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
          borderColor: theme.border,
        },
      ]}>
      <View style={styles.cardHeader}>
        <View style={styles.headerText}>
          <ThemedText type="defaultBold" numberOfLines={1}>
            {order.accountNumber}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {order.consumerName}
          </ThemedText>
        </View>
        {order.state === 'pending' ? (
          <Icon name="chevron-right" size={20} color={theme.textSecondary} />
        ) : order.state === 'cancelled' ? (
          <ServiceOrderBadge status="cancelled" />
        ) : (
          <SyncBadge status={order.state === 'done' ? 'synced' : 'pending'} />
        )}
      </View>

      <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
        {order.address}
      </ThemedText>

      <View style={[styles.footer, { borderTopColor: theme.border }]}>
        {amount !== undefined && (
          <View style={styles.footerItem}>
            <ThemedText type="small" themeColor="textSecondary">
              {balanceLabel}
            </ThemedText>
            <ThemedText type="defaultBold" style={{ color: settled ? theme.success : theme.danger }}>
              {formatPeso(amount)}
            </ThemedText>
          </View>
        )}
        <View style={styles.footerItem}>
          <ThemedText type="small" themeColor="textSecondary">
            Order
          </ThemedText>
          <ThemedText type="small">{order.id}</ThemedText>
        </View>
        {/* The eligibility fact, where the district's bills can supply one. Only on
            pending rows — on completed work it is history, and the card is already
            carrying a badge, an address and a balance. */}
        {order.state === 'pending' && order.settled !== null && order.settled !== undefined && (
          <View style={styles.footerItem}>
            <ThemedText type="small" themeColor="textSecondary">
              Account
            </ThemedText>
            <ThemedText
              type="small"
              style={{ color: order.settled ? theme.success : theme.textSecondary }}>
              {order.settled
                ? 'Settled'
                : `${order.unpaidBillCount ?? 0} unpaid${(order.daysPastDue ?? 0) > 0 ? ` · ${order.daysPastDue}d late` : ''}`}
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
  headerText: { flex: 1 },
  footer: {
    flexDirection: 'row',
    gap: Spacing.four,
    borderTopWidth: 1,
    paddingTop: Spacing.two,
  },
  footerItem: { gap: Spacing.half },
});
