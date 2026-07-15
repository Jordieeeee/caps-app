import { Platform, ScrollView, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState } from 'react';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { OfflineStorage } from '@/services/collector/offline-storage';
import { PrinterService } from '@/services/collector/printer-service';

interface ReconnectionOrder {
  id: string;
  accountNumber: string;
  accountName: string;
  address: string;
  previousBalance: number;
  settlementAmount: number;
  settlementDate: string;
  reason: string;
  status: 'pending' | 'completed' | 'cancelled';
  fieldVerification?: string;
  completionDate?: string;
  timestamp: number;
  synced: boolean;
}

const mockReconnectionOrders: ReconnectionOrder[] = [
  {
    id: 'REC-001',
    accountNumber: 'WD-12345',
    accountName: 'Carlos Garcia',
    address: '123 Main Street, Springfield',
    previousBalance: 150.00,
    settlementAmount: 150.00,
    settlementDate: '2025-07-14',
    reason: 'Full payment of outstanding balance',
    status: 'pending',
    timestamp: Date.now(),
    synced: false,
  },
  {
    id: 'REC-002',
    accountNumber: 'WD-12346',
    accountName: 'Ana Martinez',
    address: '456 Oak Avenue, Springfield',
    previousBalance: 85.50,
    settlementAmount: 85.50,
    settlementDate: '2025-07-13',
    reason: 'Payment arrangement completed',
    status: 'completed',
    fieldVerification: 'Service restored successfully. Meter reading: 1450',
    completionDate: '2025-07-15',
    timestamp: Date.now() - 86400000,
    synced: true,
  },
  {
    id: 'REC-003',
    accountNumber: 'WD-12347',
    accountName: 'Roberto Rodriguez',
    address: '789 Pine Road, Springfield',
    previousBalance: 200.00,
    settlementAmount: 200.00,
    settlementDate: '2025-07-15',
    reason: 'Full payment including penalties',
    status: 'pending',
    timestamp: Date.now(),
    synced: false,
  },
];

export default function ReconnectionsScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const insets = {
    ...safeAreaInsets,
    bottom: safeAreaInsets.bottom + BottomTabInset + Spacing.three,
  };
  const theme = useTheme();
  
  const [orders, setOrders] = useState<ReconnectionOrder[]>(mockReconnectionOrders);
  const [selectedOrder, setSelectedOrder] = useState<ReconnectionOrder | null>(null);
  const [showProcessForm, setShowProcessForm] = useState(false);
  
  // Form state
  const [fieldVerification, setFieldVerification] = useState('');

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

  const pendingOrders = orders.filter(o => o.status === 'pending');
  const completedOrders = orders.filter(o => o.status === 'completed');
  const totalSettled = orders.reduce((sum, o) => sum + o.settlementAmount, 0);

  const handleProcessReconnection = async () => {
    if (!selectedOrder || !fieldVerification) {
      return; // Validation failed
    }

    const updatedOrder: ReconnectionOrder = {
      ...selectedOrder,
      status: 'completed',
      fieldVerification,
      completionDate: new Date().toISOString().split('T')[0],
      synced: false,
    };

    try {
      await OfflineStorage.saveServiceOrder({
        id: updatedOrder.id,
        type: 'reconnection',
        accountNumber: updatedOrder.accountNumber,
        accountAddress: updatedOrder.address,
        reason: updatedOrder.reason,
        status: updatedOrder.status,
        fieldVerification: updatedOrder.fieldVerification,
        completionDate: updatedOrder.completionDate,
        timestamp: updatedOrder.timestamp,
        synced: updatedOrder.synced,
      });

      setOrders(orders.map(o => o.id === selectedOrder.id ? updatedOrder : o));
      setFieldVerification('');
      setShowProcessForm(false);
      setSelectedOrder(null);
    } catch (error) {
      console.error('Error processing reconnection:', error);
    }
  };

  const handlePrintReceipt = async (order: ReconnectionOrder) => {
    try {
      await PrinterService.printServiceOrderReceipt({
        ...order,
        type: 'reconnection',
      });
    } catch (error) {
      console.error('Error printing receipt:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return '#34C759';
      case 'pending':
        return '#FF9500';
      case 'cancelled':
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
          <ThemedText type="subtitle">Service Reconnections</ThemedText>
          <ThemedText style={styles.centerText} themeColor="textSecondary">
            Process water service reconnections for settled accounts with field verification.
          </ThemedText>
        </ThemedView>

        <ThemedView style={styles.summaryContainer}>
          <ThemedView type="backgroundElement" style={styles.summaryCard}>
            <ThemedText type="small" themeColor="textSecondary">
              Pending
            </ThemedText>
            <ThemedText type="title" style={[styles.summaryNumber, { color: '#FF9500' }]}>
              {pendingOrders.length}
            </ThemedText>
          </ThemedView>
          <ThemedView type="backgroundElement" style={styles.summaryCard}>
            <ThemedText type="small" themeColor="textSecondary">
              Completed Today
            </ThemedText>
            <ThemedText type="title" style={[styles.summaryNumber, { color: '#34C759' }]}>
              {completedOrders.filter(o => o.completionDate === new Date().toISOString().split('T')[0]).length}
            </ThemedText>
          </ThemedView>
          <ThemedView type="backgroundElement" style={styles.summaryCard}>
            <ThemedText type="small" themeColor="textSecondary">
              Total Settled
            </ThemedText>
            <ThemedText type="title" style={styles.summaryAmount}>
              ₱{totalSettled.toFixed(2)}
            </ThemedText>
          </ThemedView>
        </ThemedView>

        {showProcessForm && selectedOrder && (
          <ThemedView type="backgroundElement" style={styles.formContainer}>
            <ThemedText type="defaultBold" style={styles.formTitle}>
              Process Reconnection
            </ThemedText>
            
            <ThemedView style={styles.orderInfo}>
              <ThemedText type="small" themeColor="textSecondary">
                Account: {selectedOrder.accountNumber}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {selectedOrder.accountName}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {selectedOrder.address}
              </ThemedText>
            </ThemedView>

            <ThemedText type="small" themeColor="textSecondary">
              Field Verification Notes
            </ThemedText>
            <ThemedView type="backgroundElement" style={styles.inputContainer}>
              <TextInput
                style={[styles.textArea, { color: theme.text }]}
                placeholder="Enter field verification details (meter reading, service condition, etc.)"
                placeholderTextColor={theme.textSecondary}
                value={fieldVerification}
                onChangeText={setFieldVerification}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </ThemedView>

            <ThemedView style={styles.formActions}>
              <TouchableOpacity
                style={[styles.cancelButton, { backgroundColor: '#FF3B30' + '20' }]}
                onPress={() => {
                  setShowProcessForm(false);
                  setSelectedOrder(null);
                  setFieldVerification('');
                }}>
                <ThemedText type="small" style={{ color: '#FF3B30' }}>
                  Cancel
                </ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.completeButton, { backgroundColor: '#34C759' }]}
                onPress={handleProcessReconnection}>
                <ThemedText type="defaultBold" style={{ color: '#FFFFFF' }}>
                  Complete Reconnection
                </ThemedText>
              </TouchableOpacity>
            </ThemedView>
          </ThemedView>
        )}

        <ThemedView style={styles.ordersWrapper}>
          <ThemedText type="defaultBold" style={styles.sectionTitle}>
            Pending Reconnections
          </ThemedText>
          {pendingOrders.length === 0 && (
            <ThemedView type="backgroundElement" style={styles.emptyState}>
              <ThemedText type="small" themeColor="textSecondary">
                No pending reconnection orders
              </ThemedText>
            </ThemedView>
          )}
          {pendingOrders.map((order) => (
            <ThemedView key={order.id} type="backgroundElement" style={styles.orderCard}>
              <ThemedView style={styles.cardHeader}>
                <ThemedText style={styles.statusIcon}>🔄</ThemedText>
                <ThemedView style={styles.headerText}>
                  <ThemedText type="defaultBold" style={styles.cardTitle}>
                    {order.accountNumber}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {order.accountName}
                  </ThemedText>
                </ThemedView>
                <ThemedView
                  style={[
                    styles.statusBadge,
                    { backgroundColor: getStatusColor(order.status) + '20' },
                  ]}>
                  <ThemedText
                    type="small"
                    style={[
                      styles.statusText,
                      { color: getStatusColor(order.status) },
                    ]}>
                    {order.status.toUpperCase()}
                  </ThemedText>
                </ThemedView>
              </ThemedView>

              <ThemedView style={styles.cardDetails}>
                <ThemedView style={styles.detailRow}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Address
                  </ThemedText>
                  <ThemedText type="small">{order.address}</ThemedText>
                </ThemedView>
                <ThemedView style={styles.detailRow}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Previous Balance
                  </ThemedText>
                  <ThemedText type="defaultBold">₱{order.previousBalance.toFixed(2)}</ThemedText>
                </ThemedView>
                <ThemedView style={styles.detailRow}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Settlement Amount
                  </ThemedText>
                  <ThemedText type="defaultBold" style={{ color: '#34C759' }}>
                    ₱{order.settlementAmount.toFixed(2)}
                  </ThemedText>
                </ThemedView>
                <ThemedView style={styles.detailRow}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Settlement Date
                  </ThemedText>
                  <ThemedText type="small">{order.settlementDate}</ThemedText>
                </ThemedView>
              </ThemedView>

              <ThemedView style={styles.reasonBox}>
                <ThemedText type="small" themeColor="textSecondary">
                  Reason: {order.reason}
                </ThemedText>
              </ThemedView>

              <ThemedView style={styles.cardActions}>
                <TouchableOpacity
                  style={[styles.processButton, { backgroundColor: theme.backgroundElement }]}
                  onPress={() => {
                    setSelectedOrder(order);
                    setShowProcessForm(true);
                  }}>
                  <ThemedText type="defaultBold">Process Reconnection</ThemedText>
                </TouchableOpacity>
              </ThemedView>
            </ThemedView>
          ))}

          <ThemedText type="defaultBold" style={[styles.sectionTitle, styles.sectionTitleMargin]}>
            Completed Reconnections
          </ThemedText>
          {completedOrders.map((order) => (
            <ThemedView key={order.id} type="backgroundElement" style={styles.orderCard}>
              <ThemedView style={styles.cardHeader}>
                <ThemedText style={styles.statusIcon}>✅</ThemedText>
                <ThemedView style={styles.headerText}>
                  <ThemedText type="defaultBold" style={styles.cardTitle}>
                    {order.accountNumber}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {order.accountName}
                  </ThemedText>
                </ThemedView>
                <ThemedView
                  style={[
                    styles.statusBadge,
                    { backgroundColor: getStatusColor(order.status) + '20' },
                  ]}>
                  <ThemedText
                    type="small"
                    style={[
                      styles.statusText,
                      { color: getStatusColor(order.status) },
                    ]}>
                    {order.status.toUpperCase()}
                  </ThemedText>
                </ThemedView>
              </ThemedView>

              <ThemedView style={styles.cardDetails}>
                <ThemedView style={styles.detailRow}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Completion Date
                  </ThemedText>
                  <ThemedText type="small">{order.completionDate}</ThemedText>
                </ThemedView>
              </ThemedView>

              {order.fieldVerification && (
                <ThemedView style={styles.verificationBox}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Field Verification: {order.fieldVerification}
                  </ThemedText>
                </ThemedView>
              )}

              <ThemedView style={styles.cardActions}>
                <TouchableOpacity
                  style={[styles.printButton, { backgroundColor: theme.backgroundElement }]}
                  onPress={() => handlePrintReceipt(order)}>
                  <ThemedText type="small">🖨️ Print Receipt</ThemedText>
                </TouchableOpacity>
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
    fontSize: 18,
    fontWeight: 'bold',
  },
  summaryNumber: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  formContainer: {
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.four,
    borderRadius: Spacing.three,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  formTitle: {
    fontSize: 16,
    marginBottom: Spacing.two,
  },
  orderInfo: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
    gap: Spacing.one,
  },
  inputContainer: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
  },
  textArea: {
    fontSize: 16,
    minHeight: 80,
  },
  formActions: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  cancelButton: {
    flex: 1,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    alignItems: 'center',
  },
  completeButton: {
    flex: 2,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    alignItems: 'center',
  },
  ordersWrapper: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  sectionTitle: {
    fontSize: 16,
  },
  sectionTitleMargin: {
    marginTop: Spacing.four,
  },
  emptyState: {
    padding: Spacing.six,
    borderRadius: Spacing.three,
    alignItems: 'center',
  },
  orderCard: {
    borderRadius: Spacing.three,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  statusIcon: {
    fontSize: 24,
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
  reasonBox: {
    padding: Spacing.two,
    borderRadius: Spacing.two,
  },
  verificationBox: {
    padding: Spacing.two,
    borderRadius: Spacing.two,
  },
  cardActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  processButton: {
    flex: 1,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    alignItems: 'center',
  },
  printButton: {
    flex: 1,
    borderRadius: Spacing.two,
    padding: Spacing.two,
    alignItems: 'center',
  },
});
