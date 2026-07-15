import { Platform, ScrollView, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState } from 'react';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { OfflineStorage } from '@/collector/services/offline-storage';
import { PrinterService } from '@/collector/services/printer-service';

interface DisconnectionOrder {
  id: string;
  accountNumber: string;
  accountName: string;
  address: string;
  outstandingBalance: number;
  billingStatus: 'overdue' | 'delinquent';
  authorizedBy: string;
  authorizationDate: string;
  reason: string;
  status: 'pending' | 'completed' | 'cancelled';
  fieldVerification?: string;
  completionDate?: string;
  timestamp: number;
  synced: boolean;
}

const mockDisconnectionOrders: DisconnectionOrder[] = [
  {
    id: 'DIS-001',
    accountNumber: 'WD-12345',
    accountName: 'Carlos Garcia',
    address: '123 Main Street, Springfield',
    outstandingBalance: 450.00,
    billingStatus: 'delinquent',
    authorizedBy: 'SUP-001',
    authorizationDate: '2025-07-10',
    reason: 'Non-payment for 3 consecutive billing periods',
    status: 'pending',
    timestamp: Date.now(),
    synced: false,
  },
  {
    id: 'DIS-002',
    accountNumber: 'WD-12346',
    accountName: 'Ana Martinez',
    address: '456 Oak Avenue, Springfield',
    outstandingBalance: 285.50,
    billingStatus: 'overdue',
    authorizedBy: 'SUP-001',
    authorizationDate: '2025-07-12',
    reason: 'Overdue payment exceeding 60 days',
    status: 'completed',
    fieldVerification: 'Service disconnected. Meter sealed. Final reading: 1520',
    completionDate: '2025-07-15',
    timestamp: Date.now() - 86400000,
    synced: true,
  },
  {
    id: 'DIS-003',
    accountNumber: 'WD-12347',
    accountName: 'Roberto Rodriguez',
    address: '789 Pine Road, Springfield',
    outstandingBalance: 320.00,
    billingStatus: 'delinquent',
    authorizedBy: 'SUP-002',
    authorizationDate: '2025-07-14',
    reason: 'Non-payment for 2 consecutive billing periods',
    status: 'pending',
    timestamp: Date.now(),
    synced: false,
  },
];

export default function DisconnectionsScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const insets = {
    ...safeAreaInsets,
    bottom: safeAreaInsets.bottom + BottomTabInset + Spacing.three,
  };
  const theme = useTheme();
  
  const [orders, setOrders] = useState<DisconnectionOrder[]>(mockDisconnectionOrders);
  const [selectedOrder, setSelectedOrder] = useState<DisconnectionOrder | null>(null);
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
  const totalOutstanding = orders.reduce((sum, o) => sum + o.outstandingBalance, 0);

  const handleProcessDisconnection = async () => {
    if (!selectedOrder || !fieldVerification) {
      return; // Validation failed
    }

    const updatedOrder: DisconnectionOrder = {
      ...selectedOrder,
      status: 'completed',
      fieldVerification,
      completionDate: new Date().toISOString().split('T')[0],
      synced: false,
    };

    try {
      await OfflineStorage.saveServiceOrder({
        id: updatedOrder.id,
        type: 'disconnection',
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
      console.error('Error processing disconnection:', error);
    }
  };

  const handlePrintReceipt = async (order: DisconnectionOrder) => {
    try {
      await PrinterService.printServiceOrderReceipt({
        ...order,
        type: 'disconnection',
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

  const getBillingStatusColor = (status: string) => {
    switch (status) {
      case 'delinquent':
        return '#FF3B30';
      case 'overdue':
        return '#FF9500';
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
          <ThemedText type="subtitle">Service Disconnections</ThemedText>
          <ThemedText style={styles.centerText} themeColor="textSecondary">
            Process water service disconnections for delinquent accounts with authorized orders.
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
              Total Outstanding
            </ThemedText>
            <ThemedText type="title" style={styles.summaryAmount}>
              ₱{totalOutstanding.toFixed(2)}
            </ThemedText>
          </ThemedView>
        </ThemedView>

        {showProcessForm && selectedOrder && (
          <ThemedView type="backgroundElement" style={styles.formContainer}>
            <ThemedText type="defaultBold" style={styles.formTitle}>
              Process Disconnection
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
              <ThemedText type="small" themeColor="textSecondary">
                Outstanding: ₱{selectedOrder.outstandingBalance.toFixed(2)}
              </ThemedText>
            </ThemedView>

            <ThemedText type="small" themeColor="textSecondary">
              Field Verification Notes
            </ThemedText>
            <ThemedView type="backgroundElement" style={styles.inputContainer}>
              <TextInput
                style={[styles.textArea, { color: theme.text }]}
                placeholder="Enter field verification details (meter reading, service condition, seal number, etc.)"
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
                style={[styles.completeButton, { backgroundColor: '#FF3B30' }]}
                onPress={handleProcessDisconnection}>
                <ThemedText type="defaultBold" style={{ color: '#FFFFFF' }}>
                  Confirm Disconnection
                </ThemedText>
              </TouchableOpacity>
            </ThemedView>
          </ThemedView>
        )}

        <ThemedView style={styles.ordersWrapper}>
          <ThemedText type="defaultBold" style={styles.sectionTitle}>
            Pending Disconnections
          </ThemedText>
          {pendingOrders.length === 0 && (
            <ThemedView type="backgroundElement" style={styles.emptyState}>
              <ThemedText type="small" themeColor="textSecondary">
                No pending disconnection orders
              </ThemedText>
            </ThemedView>
          )}
          {pendingOrders.map((order) => (
            <ThemedView key={order.id} type="backgroundElement" style={styles.orderCard}>
              <ThemedView style={styles.cardHeader}>
                <ThemedText style={styles.statusIcon}>⚠️</ThemedText>
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
                    Outstanding Balance
                  </ThemedText>
                  <ThemedText type="defaultBold" style={{ color: '#FF3B30' }}>
                    ₱{order.outstandingBalance.toFixed(2)}
                  </ThemedText>
                </ThemedView>
                <ThemedView style={styles.detailRow}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Billing Status
                  </ThemedText>
                  <ThemedText
                    type="small"
                    style={{ color: getBillingStatusColor(order.billingStatus) }}>
                    {order.billingStatus.toUpperCase()}
                  </ThemedText>
                </ThemedView>
                <ThemedView style={styles.detailRow}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Authorized By
                  </ThemedText>
                  <ThemedText type="small">{order.authorizedBy}</ThemedText>
                </ThemedView>
                <ThemedView style={styles.detailRow}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Authorization Date
                  </ThemedText>
                  <ThemedText type="small">{order.authorizationDate}</ThemedText>
                </ThemedView>
              </ThemedView>

              <ThemedView style={styles.reasonBox}>
                <ThemedText type="small" themeColor="textSecondary">
                  Reason: {order.reason}
                </ThemedText>
              </ThemedView>

              <ThemedView style={styles.cardActions}>
                <TouchableOpacity
                  style={[styles.processButton, { backgroundColor: '#FF3B30' }]}
                  onPress={() => {
                    setSelectedOrder(order);
                    setShowProcessForm(true);
                  }}>
                  <ThemedText type="defaultBold" style={{ color: '#FFFFFF' }}>
                    Process Disconnection
                  </ThemedText>
                </TouchableOpacity>
              </ThemedView>
            </ThemedView>
          ))}

          <ThemedText type="defaultBold" style={[styles.sectionTitle, styles.sectionTitleMargin]}>
            Completed Disconnections
          </ThemedText>
          {completedOrders.map((order) => (
            <ThemedView key={order.id} type="backgroundElement" style={styles.orderCard}>
              <ThemedView style={styles.cardHeader}>
                <ThemedText style={styles.statusIcon}>🔌</ThemedText>
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
