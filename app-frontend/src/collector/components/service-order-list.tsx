import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ServiceOrderService, type ServiceOrderRow } from '@/collector/services/service-orders';
import { Icon } from '@/shared/components/icon';
import { ListEmpty, ListError } from '@/shared/components/list-states';
import { ScreenContainer, ScreenSection } from '@/shared/components/screen-container';
import { SkeletonList } from '@/shared/components/skeleton';
import { SyncBadge } from '@/shared/components/status-badge';
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
    balanceLabel: 'Settled',
    icon: 'file-check',
  },
  disconnection: {
    route: 'disconnections',
    emptyTitle: 'No pending disconnections',
    emptyBody:
      'Disconnection orders authorised by the office appear here, including while you are offline.',
    doneTitle: 'Disconnected today',
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

  const { state, reload } = useAsync(useCallback(() => ServiceOrderService.list(kind), [kind]));

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  const rows = state.status === 'ready' ? state.data : [];
  const pending = rows.filter((r) => r.state === 'pending');
  const completed = rows.filter((r) => r.state !== 'pending');

  return (
    <ScreenContainer variant="stack">
      <ScreenSection gap={Spacing.three}>
        {state.status === 'loading' && <SkeletonList count={3} label="Loading orders" />}

        {state.status === 'error' && (
          <ListError
            title="Could not load orders"
            body="The orders saved on this phone could not be read. Any work you have already confirmed is still saved."
            onRetry={reload}
          />
        )}

        {state.status === 'ready' && pending.length === 0 && (
          <ListEmpty icon={copy.icon} title={copy.emptyTitle} body={copy.emptyBody} />
        )}

        {pending.map((order) => (
          <OrderRow
            key={order.id}
            order={order}
            balanceLabel={copy.balanceLabel}
            onPress={() => router.push(`/collector/more/${copy.route}/${order.id}`)}
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
              onPress={() => router.push(`/collector/more/${copy.route}/${order.id}`)}
            />
          ))}
        </ScreenSection>
      )}
    </ScreenContainer>
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
  const amount = order.settledAmount ?? order.outstandingBalance;
  const settled = order.kind === 'reconnection';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${order.accountNumber}, ${order.consumerName}, ${order.address}. ${balanceLabel} ${formatPeso(amount)}. Order ${order.id}.`}
      accessibilityHint={
        order.state === 'pending' ? 'Opens confirmation for this order' : 'Opens this completed order'
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
        ) : (
          <SyncBadge status={order.state === 'done' ? 'synced' : 'pending'} />
        )}
      </View>

      <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
        {order.address}
      </ThemedText>

      <View style={[styles.footer, { borderTopColor: theme.border }]}>
        <View style={styles.footerItem}>
          <ThemedText type="small" themeColor="textSecondary">
            {balanceLabel}
          </ThemedText>
          <ThemedText type="defaultBold" style={{ color: settled ? theme.success : theme.danger }}>
            {formatPeso(amount)}
          </ThemedText>
        </View>
        <View style={styles.footerItem}>
          <ThemedText type="small" themeColor="textSecondary">
            Order
          </ThemedText>
          <ThemedText type="small">{order.id}</ThemedText>
        </View>
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
  headerText: { flex: 1 },
  footer: {
    flexDirection: 'row',
    gap: Spacing.four,
    borderTopWidth: 1,
    paddingTop: Spacing.two,
  },
  footerItem: { gap: Spacing.half },
});
