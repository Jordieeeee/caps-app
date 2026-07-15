import { Platform, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface Bill {
  id: string;
  accountNumber: string;
  billingPeriod: string;
  amount: number;
  dueDate: string;
  status: 'paid' | 'pending' | 'overdue';
  paymentDate?: string;
  paymentMethod?: string;
}

const mockBills: Bill[] = [
  {
    id: '1',
    accountNumber: 'WD-12345',
    billingPeriod: 'June 2025',
    amount: 45.50,
    dueDate: '2025-07-15',
    status: 'pending',
  },
  {
    id: '2',
    accountNumber: 'WD-12345',
    billingPeriod: 'May 2025',
    amount: 42.30,
    dueDate: '2025-06-15',
    status: 'paid',
    paymentDate: '2025-06-10',
    paymentMethod: 'Credit Card',
  },
  {
    id: '3',
    accountNumber: 'WD-12345',
    billingPeriod: 'April 2025',
    amount: 38.75,
    dueDate: '2025-05-15',
    status: 'paid',
    paymentDate: '2025-05-08',
    paymentMethod: 'Bank Transfer',
  },
  {
    id: '4',
    accountNumber: 'WD-12345',
    billingPeriod: 'March 2025',
    amount: 41.20,
    dueDate: '2025-04-15',
    status: 'paid',
    paymentDate: '2025-04-12',
    paymentMethod: 'Credit Card',
  },
];

function getStatusColor(status: string, theme: any) {
  switch (status) {
    case 'paid':
      return '#34C759';
    case 'pending':
      return '#FF9500';
    case 'overdue':
      return '#FF3B30';
    default:
      return theme.text;
  }
}

function getStatusText(status: string) {
  switch (status) {
    case 'paid':
      return 'PAID';
    case 'pending':
      return 'PENDING';
    case 'overdue':
      return 'OVERDUE';
    default:
      return status.toUpperCase();
  }
}

export default function BillingScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const insets = {
    ...safeAreaInsets,
    bottom: safeAreaInsets.bottom + BottomTabInset + Spacing.three,
  };
  const theme = useTheme();

  const contentPlatformStyle = Platform.select({
    android: {
      paddingTop: insets.top,
      paddingLeft: insets.left,
      paddingRight: insets.right,
      paddingBottom: insets.bottom,
    },
    web: {
      paddingTop: Spacing.six,
      paddingBottom: Spacing.four,
    },
  });

  const totalPaid = mockBills
    .filter((bill) => bill.status === 'paid')
    .reduce((sum, bill) => sum + bill.amount, 0);
  const totalPending = mockBills
    .filter((bill) => bill.status === 'pending')
    .reduce((sum, bill) => sum + bill.amount, 0);

  return (
    <ScrollView
      style={[styles.scrollView, { backgroundColor: theme.background }]}
      contentInset={insets}
      contentContainerStyle={[styles.contentContainer, contentPlatformStyle]}>
      <ThemedView style={styles.container}>
        <ThemedView style={styles.titleContainer}>
          <ThemedText type="subtitle">Billing History</ThemedText>
          <ThemedText style={styles.centerText} themeColor="textSecondary">
            View your complete billing history and payment tracking.
          </ThemedText>
        </ThemedView>

        <ThemedView style={styles.summaryContainer}>
          <ThemedView type="backgroundElement" style={styles.summaryCard}>
            <ThemedText type="small" themeColor="textSecondary">
              Total Paid (YTD)
            </ThemedText>
            <ThemedText type="title" style={styles.summaryAmount}>
              ₱{totalPaid.toFixed(2)}
            </ThemedText>
          </ThemedView>
          <ThemedView type="backgroundElement" style={styles.summaryCard}>
            <ThemedText type="small" themeColor="textSecondary">
              Pending Amount
            </ThemedText>
            <ThemedText type="title" style={styles.summaryAmount}>
              ₱{totalPending.toFixed(2)}
            </ThemedText>
          </ThemedView>
        </ThemedView>

        <ThemedView style={styles.billsWrapper}>
          <ThemedText type="defaultBold" style={styles.sectionTitle}>
            Transaction History
          </ThemedText>
          {mockBills.map((bill) => (
            <ThemedView key={bill.id} type="backgroundElement" style={styles.billCard}>
              <ThemedView style={styles.cardHeader}>
                <ThemedView style={styles.headerText}>
                  <ThemedText type="defaultBold" style={styles.cardTitle}>
                    {bill.billingPeriod}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    Account: {bill.accountNumber}
                  </ThemedText>
                </ThemedView>
                <ThemedView
                  style={[
                    styles.statusBadge,
                    { backgroundColor: getStatusColor(bill.status, theme) + '20' },
                  ]}>
                  <ThemedText
                    type="small"
                    style={[
                      styles.statusText,
                      { color: getStatusColor(bill.status, theme) },
                    ]}>
                    {getStatusText(bill.status)}
                  </ThemedText>
                </ThemedView>
              </ThemedView>
              <ThemedView style={styles.cardDetails}>
                <ThemedView style={styles.detailRow}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Amount
                  </ThemedText>
                  <ThemedText type="defaultBold">₱{bill.amount.toFixed(2)}</ThemedText>
                </ThemedView>
                <ThemedView style={styles.detailRow}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Due Date
                  </ThemedText>
                  <ThemedText type="small">{bill.dueDate}</ThemedText>
                </ThemedView>
                {bill.status === 'paid' && (
                  <>
                    <ThemedView style={styles.detailRow}>
                      <ThemedText type="small" themeColor="textSecondary">
                        Payment Date
                      </ThemedText>
                      <ThemedText type="small">{bill.paymentDate}</ThemedText>
                    </ThemedView>
                    <ThemedView style={styles.detailRow}>
                      <ThemedText type="small" themeColor="textSecondary">
                        Payment Method
                      </ThemedText>
                      <ThemedText type="small">{bill.paymentMethod}</ThemedText>
                    </ThemedView>
                  </>
                )}
              </ThemedView>
            </ThemedView>
          ))}
        </ThemedView>
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  container: {
    maxWidth: MaxContentWidth,
    flexGrow: 1,
  },
  titleContainer: {
    gap: Spacing.three,
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.six,
  },
  centerText: {
    textAlign: 'center',
  },
  summaryContainer: {
    flexDirection: 'row',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  summaryCard: {
    flex: 1,
    borderRadius: Spacing.three,
    padding: Spacing.four,
    alignItems: 'center',
  },
  summaryAmount: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  billsWrapper: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  sectionTitle: {
    fontSize: 18,
  },
  billCard: {
    borderRadius: Spacing.three,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  headerText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
  },
  statusBadge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.two,
  },
  statusText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  cardDetails: {
    gap: Spacing.two,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
