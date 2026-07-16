import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { listBills, type Bill } from '@/consumer/services/consumer-data';
import { dueLabel, daysUntil, summarise } from '@/consumer/lib/bill-summary';
import { FilterChips } from '@/shared/components/filter-chips';
import { Icon } from '@/shared/components/icon';
import { ListEmpty, ListError, ListLoading } from '@/shared/components/list-states';
import { ScreenContainer, ScreenSection } from '@/shared/components/screen-container';
import { ScreenHeader } from '@/shared/components/screen-header';
import { PaymentBadge } from '@/shared/components/status-badge';
import { TwdButton } from '@/shared/components/twd-button';
import { formatPeso } from '@/shared/format/currency';
import { useAsync } from '@/shared/hooks/use-async';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { Radius, Spacing } from '@/shared/theme/twd';

/**
 * Bills — what's owed now, and everything that came before.
 *
 * This is Billing and Payments merged. They were two tabs showing one thing: a
 * "Billing History" list of past bills, and a "Payment Notifications" list of the
 * same bills before they were paid, with a nudge attached. Splitting a consumer's
 * bills by whether they had been paid yet made the app's filing system the user's
 * problem — "my June bill" lived in a different tab depending on the date.
 *
 * The nudge survived the merge; the "Recommendation" boxes did not. They read
 * "Payment due in 5 days. To avoid late fees, we recommend processing payment
 * today." — a paragraph of advice restating a due date the card already showed.
 * Urgency now lives in the due label and the card's border tone, which cost no
 * lines of reading.
 */
export default function ConsumerBillsScreen() {
  const router = useRouter();
  const { state, reload } = useAsync(useCallback(() => listBills(), []));
  const [filter, setFilter] = useState<string | null>(null);

  return (
    <ScreenContainer>
      <ScreenHeader title="Bills" subtitle="What you owe and what you've paid" />

      {state.status === 'loading' && (
        <ScreenSection>
          <ListLoading label="Loading your bills…" />
        </ScreenSection>
      )}

      {state.status === 'error' && (
        <ScreenSection>
          <ListError
            title="Could not load your bills"
            body="We couldn't reach Tanauan City Water District just now. Check your connection and try again."
            onRetry={reload}
          />
        </ScreenSection>
      )}

      {state.status === 'ready' && (
        <BillsBody
          bills={state.data}
          filter={filter}
          onFilter={setFilter}
          onHowToPay={() => router.push('/consumer/bills/how-to-pay')}
        />
      )}
    </ScreenContainer>
  );
}

interface BillsBodyProps {
  bills: Bill[];
  filter: string | null;
  onFilter: (id: string | null) => void;
  onHowToPay: () => void;
}

function BillsBody({ bills, filter, onFilter, onHowToPay }: BillsBodyProps) {
  const theme = useTwdTheme();
  const { totalDue, outstanding } = summarise(bills);

  const paidCount = bills.filter((b) => b.status === 'paid').length;
  const totalPaid = bills.filter((b) => b.status === 'paid').reduce((sum, b) => sum + b.amount, 0);

  const visible = filter ? bills.filter((b) => b.status === filter) : bills;

  if (bills.length === 0) {
    return (
      <ScreenSection>
        <ListEmpty
          icon="file-text"
          title="No bills yet"
          body="Once TWD issues a bill for your linked account, it will appear here with its due date."
        />
      </ScreenSection>
    );
  }

  return (
    <>
      {/* Two tiles, not three. Money needs the width — three peso figures across a
          375px screen is what wrapped "₱18500.00" into "₱1850" / "0.00" on the
          collector's report tiles. */}
      <ScreenSection gap={Spacing.three}>
        <View style={styles.tiles}>
          <ThemedView type="backgroundElement" style={styles.tile}>
            <ThemedText type="small" themeColor="textSecondary">
              Outstanding
            </ThemedText>
            <ThemedText
              style={[styles.tileAmount, { color: totalDue > 0 ? theme.danger : theme.success }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.6}>
              {formatPeso(totalDue)}
            </ThemedText>
          </ThemedView>
          <ThemedView type="backgroundElement" style={styles.tile}>
            <ThemedText type="small" themeColor="textSecondary">
              Paid to date
            </ThemedText>
            <ThemedText
              style={styles.tileAmount}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.6}>
              {formatPeso(totalPaid)}
            </ThemedText>
          </ThemedView>
        </View>

        {outstanding.length > 0 && (
          <TwdButton
            label="How to pay"
            icon="wallet"
            onPress={onHowToPay}
            accessibilityHint="Shows where and how to pay your TWD bill"
          />
        )}
      </ScreenSection>

      <ScreenSection gap={Spacing.three}>
        <ThemedText type="defaultBold">Your bills</ThemedText>

        <FilterChips
          chips={[
            {
              id: 'overdue',
              label: `Overdue (${bills.filter((b) => b.status === 'overdue').length})`,
            },
            { id: 'pending', label: `Unpaid (${bills.filter((b) => b.status === 'pending').length})` },
            { id: 'paid', label: `Paid (${paidCount})` },
          ]}
          selectedId={filter}
          onSelect={onFilter}
          allLabel={`All (${bills.length})`}
          accessibilityLabel="Filter bills by status"
        />

        {visible.length === 0 && (
          <ListEmpty
            icon="file-text"
            title="No bills with this status"
            body="Nothing matches the selected filter. Clear it to see every bill."
            action={{ label: 'Show all', onPress: () => onFilter(null) }}
          />
        )}

        {visible.map((bill) => (
          <BillCard key={bill.id} bill={bill} />
        ))}
      </ScreenSection>
    </>
  );
}

function BillCard({ bill }: { bill: Bill }) {
  const theme = useTwdTheme();
  const unpaid = bill.status !== 'paid';
  const days = unpaid ? daysUntil(bill.dueDate) : null;

  const isLate = bill.status === 'overdue' || (days !== null && days < 0);
  const isSoon = !isLate && days !== null && days <= 7;
  const accent = isLate ? theme.danger : isSoon ? theme.warning : theme.border;
  const dueColor = isLate ? theme.danger : isSoon ? theme.warning : theme.textSecondary;

  return (
    <ThemedView type="backgroundElement" style={[styles.card, { borderColor: accent }]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderText}>
          <ThemedText type="defaultBold" style={styles.cardTitle}>
            {bill.billingPeriod}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {bill.accountNumber}
          </ThemedText>
        </View>
        <PaymentBadge status={bill.status} />
      </View>

      <View style={styles.amountRow}>
        <ThemedText
          style={styles.cardAmount}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}>
          {formatPeso(bill.amount)}
        </ThemedText>
        {unpaid && (
          <View style={styles.dueRow}>
            <Icon name={isLate ? 'alert-triangle' : 'calendar'} size={16} color={dueColor} />
            <ThemedText type="smallBold" style={{ color: dueColor }}>
              {dueLabel(days)}
            </ThemedText>
          </View>
        )}
      </View>

      <View style={styles.details}>
        <View style={styles.detailRow}>
          <ThemedText type="small" themeColor="textSecondary">
            Due date
          </ThemedText>
          <ThemedText type="small">{bill.dueDate}</ThemedText>
        </View>
        {bill.status === 'paid' && (
          <>
            <View style={styles.detailRow}>
              <ThemedText type="small" themeColor="textSecondary">
                Paid on
              </ThemedText>
              <ThemedText type="small">{bill.paymentDate}</ThemedText>
            </View>
            <View style={styles.detailRow}>
              <ThemedText type="small" themeColor="textSecondary">
                Paid via
              </ThemedText>
              <ThemedText type="small">{bill.paymentMethod}</ThemedText>
            </View>
          </>
        )}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  tiles: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  tile: {
    flex: 1,
    borderRadius: Radius.card,
    padding: Spacing.three,
    gap: Spacing.one,
    alignItems: 'center',
  },
  tileAmount: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
  },
  card: {
    borderRadius: Radius.card,
    borderWidth: 2,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  cardHeaderText: { flex: 1 },
  cardTitle: { fontSize: 16 },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  cardAmount: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
  },
  dueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  details: { gap: Spacing.two },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
