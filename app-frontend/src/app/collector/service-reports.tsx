import { Platform, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState } from 'react';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { PrinterService } from '@/services/collector/printer-service';

interface Invoice {
  id: string;
  accountNumber: string;
  accountName: string;
  address: string;
  billingPeriod: string;
  amount: number;
  status: 'billed' | 'paid' | 'overdue';
  dueDate: string;
  meterReading: {
    previous: number;
    current: number;
    consumption: number;
  };
}

interface CollectionPeriod {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  totalInvoices: number;
  totalBilled: number;
  totalCollected: number;
}

const mockCollectionPeriods: CollectionPeriod[] = [
  {
    id: 'CP-2025-07',
    name: 'July 2025',
    startDate: '2025-07-01',
    endDate: '2025-07-31',
    totalInvoices: 450,
    totalBilled: 18500,
    totalCollected: 12500,
  },
  {
    id: 'CP-2025-06',
    name: 'June 2025',
    startDate: '2025-06-01',
    endDate: '2025-06-30',
    totalInvoices: 445,
    totalBilled: 18200,
    totalCollected: 18200,
  },
  {
    id: 'CP-2025-05',
    name: 'May 2025',
    startDate: '2025-05-01',
    endDate: '2025-05-31',
    totalInvoices: 440,
    totalBilled: 17800,
    totalCollected: 17500,
  },
];

const mockInvoices: Invoice[] = [
  {
    id: 'INV-001',
    accountNumber: 'WD-12345',
    accountName: 'Juan Dela Cruz',
    address: '123 Main Street, Springfield',
    billingPeriod: 'July 2025',
    amount: 45.50,
    status: 'billed',
    dueDate: '2025-08-15',
    meterReading: {
      previous: 1250,
      current: 1285,
      consumption: 35,
    },
  },
  {
    id: 'INV-002',
    accountNumber: 'WD-12346',
    accountName: 'Maria Santos',
    address: '456 Oak Avenue, Springfield',
    billingPeriod: 'July 2025',
    amount: 38.75,
    status: 'paid',
    dueDate: '2025-08-15',
    meterReading: {
      previous: 980,
      current: 1015,
      consumption: 35,
    },
  },
  {
    id: 'INV-003',
    accountNumber: 'WD-12347',
    accountName: 'Pedro Reyes',
    address: '789 Pine Road, Springfield',
    billingPeriod: 'July 2025',
    amount: 52.25,
    status: 'overdue',
    dueDate: '2025-08-15',
    meterReading: {
      previous: 1450,
      current: 1480,
      consumption: 30,
    },
  },
];

export default function ServiceReportsScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const insets = {
    ...safeAreaInsets,
    bottom: safeAreaInsets.bottom + BottomTabInset + Spacing.three,
  };
  const theme = useTheme();
  const [selectedPeriod, setSelectedPeriod] = useState<CollectionPeriod | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>(mockInvoices);

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

  const currentPeriod = selectedPeriod || mockCollectionPeriods[0];
  const billedCount = invoices.filter(i => i.status === 'billed').length;
  const paidCount = invoices.filter(i => i.status === 'paid').length;
  const overdueCount = invoices.filter(i => i.status === 'overdue').length;
  const collectionRate = currentPeriod.totalBilled > 0 
    ? (currentPeriod.totalCollected / currentPeriod.totalBilled) * 100 
    : 0;

  const handlePrintReport = async () => {
    try {
      const printData = {
        type: 'report' as const,
        title: `SERVICE REPORT - ${currentPeriod.name}`,
        content: [
          `Period: ${currentPeriod.startDate} to ${currentPeriod.endDate}`,
          `Total Invoices: ${currentPeriod.totalInvoices}`,
          `Total Billed: ₱${currentPeriod.totalBilled.toFixed(2)}`,
          `Total Collected: ₱${currentPeriod.totalCollected.toFixed(2)}`,
          `Collection Rate: ${collectionRate.toFixed(1)}%`,
          '--------------------------------',
          `Billed: ${billedCount}`,
          `Paid: ${paidCount}`,
          `Overdue: ${overdueCount}`,
        ],
        footer: 'End of Service Report',
      };
      await PrinterService.print(printData);
    } catch (error) {
      console.error('Error printing report:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return '#34C759';
      case 'billed':
        return '#007AFF';
      case 'overdue':
        return '#FF3B30';
      default:
        return theme.text;
    }
  };

  return (
    <ScrollView
      style={[styles.scrollView, { backgroundColor: theme.background }]}
      contentInset={insets}
      contentContainerStyle={[styles.contentContainer, contentPlatformStyle]}>
      <ThemedView style={styles.container}>
        <ThemedView style={styles.titleContainer}>
          <ThemedText type="subtitle">Service & Invoice Reports</ThemedText>
          <ThemedText style={styles.centerText} themeColor="textSecondary">
            View summarized billed accounts for each collection period.
          </ThemedText>
        </ThemedView>

        <ThemedView style={styles.periodSelector}>
          <ThemedText type="defaultBold" style={styles.sectionTitle}>
            Collection Period
          </ThemedText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.periodScroll}>
            {mockCollectionPeriods.map((period) => (
              <TouchableOpacity
                key={period.id}
                style={[
                  styles.periodChip,
                  selectedPeriod?.id === period.id && {
                    backgroundColor: theme.backgroundElement,
                  },
                ]}
                onPress={() => setSelectedPeriod(period)}>
                <ThemedText type="small">{period.name}</ThemedText>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </ThemedView>

        <ThemedView style={styles.summaryContainer}>
          <ThemedView type="backgroundElement" style={styles.summaryCard}>
            <ThemedText type="small" themeColor="textSecondary">
              Total Billed
            </ThemedText>
            <ThemedText type="title" style={styles.summaryAmount}>
              ₱{currentPeriod.totalBilled.toFixed(2)}
            </ThemedText>
          </ThemedView>
          <ThemedView type="backgroundElement" style={styles.summaryCard}>
            <ThemedText type="small" themeColor="textSecondary">
              Total Collected
            </ThemedText>
            <ThemedText type="title" style={[styles.summaryAmount, { color: '#34C759' }]}>
              ₱{currentPeriod.totalCollected.toFixed(2)}
            </ThemedText>
          </ThemedView>
          <ThemedView type="backgroundElement" style={styles.summaryCard}>
            <ThemedText type="small" themeColor="textSecondary">
              Collection Rate
            </ThemedText>
            <ThemedText type="title" style={styles.summaryNumber}>
              {collectionRate.toFixed(1)}%
            </ThemedText>
          </ThemedView>
        </ThemedView>

        <ThemedView style={styles.statusContainer}>
          <ThemedView type="backgroundElement" style={styles.statusCard}>
            <ThemedText type="small" themeColor="textSecondary">
              Billed
            </ThemedText>
            <ThemedText type="defaultBold" style={{ color: '#007AFF' }}>
              {billedCount}
            </ThemedText>
          </ThemedView>
          <ThemedView type="backgroundElement" style={styles.statusCard}>
            <ThemedText type="small" themeColor="textSecondary">
              Paid
            </ThemedText>
            <ThemedText type="defaultBold" style={{ color: '#34C759' }}>
              {paidCount}
            </ThemedText>
          </ThemedView>
          <ThemedView type="backgroundElement" style={styles.statusCard}>
            <ThemedText type="small" themeColor="textSecondary">
              Overdue
            </ThemedText>
            <ThemedText type="defaultBold" style={{ color: '#FF3B30' }}>
              {overdueCount}
            </ThemedText>
          </ThemedView>
        </ThemedView>

        <ThemedView style={styles.actionsContainer}>
          <TouchableOpacity
            style={[styles.printButton, { backgroundColor: theme.backgroundElement }]}
            onPress={handlePrintReport}>
            <ThemedText type="defaultBold">🖨️ Print Report</ThemedText>
          </TouchableOpacity>
        </ThemedView>

        <ThemedView style={styles.invoicesWrapper}>
          <ThemedText type="defaultBold" style={styles.sectionTitle}>
            Invoice Details
          </ThemedText>
          {invoices.map((invoice) => (
            <ThemedView key={invoice.id} type="backgroundElement" style={styles.invoiceCard}>
              <ThemedView style={styles.cardHeader}>
                <ThemedView style={styles.headerText}>
                  <ThemedText type="defaultBold" style={styles.cardTitle}>
                    {invoice.accountNumber}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {invoice.accountName}
                  </ThemedText>
                </ThemedView>
                <ThemedView
                  style={[
                    styles.statusBadge,
                    { backgroundColor: getStatusColor(invoice.status) + '20' },
                  ]}>
                  <ThemedText
                    type="small"
                    style={[
                      styles.statusText,
                      { color: getStatusColor(invoice.status) },
                    ]}>
                    {invoice.status.toUpperCase()}
                  </ThemedText>
                </ThemedView>
              </ThemedView>

              <ThemedView style={styles.cardDetails}>
                <ThemedView style={styles.detailRow}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Address
                  </ThemedText>
                  <ThemedText type="small">{invoice.address}</ThemedText>
                </ThemedView>
                <ThemedView style={styles.detailRow}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Billing Period
                  </ThemedText>
                  <ThemedText type="small">{invoice.billingPeriod}</ThemedText>
                </ThemedView>
                <ThemedView style={styles.detailRow}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Amount
                  </ThemedText>
                  <ThemedText type="defaultBold">₱{invoice.amount.toFixed(2)}</ThemedText>
                </ThemedView>
                <ThemedView style={styles.detailRow}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Due Date
                  </ThemedText>
                  <ThemedText type="small">{invoice.dueDate}</ThemedText>
                </ThemedView>
              </ThemedView>

              <ThemedView style={styles.meterSection}>
                <ThemedText type="small" themeColor="textSecondary">
                  Meter Reading
                </ThemedText>
                <ThemedView style={styles.meterDetails}>
                  <ThemedView style={styles.meterItem}>
                    <ThemedText type="small" themeColor="textSecondary">
                      Prev
                    </ThemedText>
                    <ThemedText type="defaultBold">{invoice.meterReading.previous}</ThemedText>
                  </ThemedView>
                  <ThemedView style={styles.meterItem}>
                    <ThemedText type="small" themeColor="textSecondary">
                      Curr
                    </ThemedText>
                    <ThemedText type="defaultBold">{invoice.meterReading.current}</ThemedText>
                  </ThemedView>
                  <ThemedView style={styles.meterItem}>
                    <ThemedText type="small" themeColor="textSecondary">
                      Cons
                    </ThemedText>
                    <ThemedText type="defaultBold" style={{ color: '#007AFF' }}>
                      {invoice.meterReading.consumption} m³
                    </ThemedText>
                  </ThemedView>
                </ThemedView>
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
  periodSelector: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  sectionTitle: {
    fontSize: 16,
    marginBottom: Spacing.two,
  },
  periodScroll: {
    flexDirection: 'row',
  },
  periodChip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
    marginRight: Spacing.two,
    borderWidth: 1,
    borderColor: 'transparent',
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
    fontSize: 20,
    fontWeight: 'bold',
  },
  summaryNumber: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  statusContainer: {
    flexDirection: 'row',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  statusCard: {
    flex: 1,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    alignItems: 'center',
  },
  actionsContainer: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  printButton: {
    borderRadius: Spacing.three,
    padding: Spacing.four,
    alignItems: 'center',
  },
  invoicesWrapper: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  invoiceCard: {
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
  meterSection: {
    paddingTop: Spacing.two,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  meterDetails: {
    flexDirection: 'row',
    gap: Spacing.three,
    marginTop: Spacing.two,
  },
  meterItem: {
    flex: 1,
    alignItems: 'center',
  },
});
