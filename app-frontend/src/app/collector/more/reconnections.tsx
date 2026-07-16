import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useState } from 'react';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { OfflineStorage } from '@/collector/services/offline-storage';
import { PrinterService } from '@/collector/services/printer-service';
import { formatPeso } from '@/shared/format/currency';
import { Icon } from '@/shared/components/icon';
import { ListEmpty } from '@/shared/components/list-states';
import { ServiceOrderBadge } from '@/shared/components/status-badge';
import { TwdButton } from '@/shared/components/twd-button';
import { useStackContentInsets } from '@/shared/hooks/use-content-insets';
import { usePrint } from '@/shared/hooks/use-print';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { Radius } from '@/shared/theme/twd';

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
    address: '24 Mabini Street, Brgy. Poblacion 3, Tanauan City',
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
    address: '117 J.P. Laurel Highway, Brgy. Darasa, Tanauan City',
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
    address: '8 Rizal Avenue, Brgy. Sambat, Tanauan City',
    previousBalance: 200.00,
    settlementAmount: 200.00,
    settlementDate: '2025-07-15',
    reason: 'Full payment including penalties',
    status: 'pending',
    timestamp: Date.now(),
    synced: false,
  },
];

/**
 * Reconnection work orders. Title comes from the navigation header.
 */
export default function ReconnectionsScreen() {
  const insets = useStackContentInsets();
  const theme = useTheme();
  const twd = useTwdTheme();
  const { print, printing } = usePrint();

  const [orders, setOrders] = useState<ReconnectionOrder[]>(mockReconnectionOrders);
  const [selectedOrder, setSelectedOrder] = useState<ReconnectionOrder | null>(null);
  const [showProcessForm, setShowProcessForm] = useState(false);
  const [fieldVerification, setFieldVerification] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);

  const pendingOrders = orders.filter((o) => o.status === 'pending');
  const completedOrders = orders.filter((o) => o.status === 'completed');
  const totalSettled = orders.reduce((sum, o) => sum + o.settlementAmount, 0);

  /**
   * Completing an order without verification notes used to `return` silently — a
   * dead button, same defect as the Collections save. A reconnection order is a
   * legal record that service was restored; the verification note is the part a
   * dispute hinges on, so the requirement gets stated rather than implied.
   */
  const handleProcessReconnection = async () => {
    setFormError(null);
    if (!selectedOrder) return;

    if (!fieldVerification.trim()) {
      setFormError(
        'Enter field verification notes first — the meter reading and the condition of the service.'
      );
      return;
    }

    const updatedOrder: ReconnectionOrder = {
      ...selectedOrder,
      status: 'completed',
      fieldVerification,
      completionDate: new Date().toISOString().split('T')[0],
      synced: false,
    };

    setSavingOrder(true);
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

      setOrders(orders.map((o) => (o.id === selectedOrder.id ? updatedOrder : o)));
      setFieldVerification('');
      setShowProcessForm(false);
      setSelectedOrder(null);
    } catch {
      setFormError('Could not save this order to the phone. Try again before leaving the site.');
    } finally {
      setSavingOrder(false);
    }
  };

  const handlePrintReceipt = (order: ReconnectionOrder) =>
    print(() => PrinterService.printServiceOrderReceipt({ ...order, type: 'reconnection' }));

  return (
    <ScrollView
      style={[styles.scrollView, { backgroundColor: theme.background }]}
      contentContainerStyle={[styles.contentContainer, insets]}>
      <ThemedView style={styles.container}>
        <ThemedView style={styles.summaryContainer}>
          <ThemedView type="backgroundElement" style={styles.summaryCard}>
            <ThemedText type="small" themeColor="textSecondary">
              Pending
            </ThemedText>
            <ThemedText style={[styles.summaryNumber, { color: twd.warning }]} numberOfLines={1}>
              {pendingOrders.length}
            </ThemedText>
          </ThemedView>
          <ThemedView type="backgroundElement" style={styles.summaryCard}>
            <ThemedText type="small" themeColor="textSecondary">
              Done today
            </ThemedText>
            <ThemedText style={[styles.summaryNumber, { color: twd.success }]} numberOfLines={1}>
              {
                completedOrders.filter(
                  (o) => o.completionDate === new Date().toISOString().split('T')[0]
                ).length
              }
            </ThemedText>
          </ThemedView>
          <ThemedView type="backgroundElement" style={styles.summaryCard}>
            <ThemedText type="small" themeColor="textSecondary">
              Settled
            </ThemedText>
            <ThemedText
              style={styles.summaryNumber}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.6}>
              {formatPeso(totalSettled)}
            </ThemedText>
          </ThemedView>
        </ThemedView>

        {showProcessForm && selectedOrder && (
          <ThemedView type="backgroundElement" style={styles.formContainer}>
            <ThemedText type="defaultBold" style={styles.formTitle}>
              Process Reconnection
            </ThemedText>

            <View style={styles.orderInfo}>
              <ThemedText type="small" themeColor="textSecondary">
                Account: {selectedOrder.accountNumber}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {selectedOrder.accountName}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {selectedOrder.address}
              </ThemedText>
            </View>

            <ThemedText type="small" themeColor="textSecondary">
              Field Verification Notes
            </ThemedText>
            <View
              style={[
                styles.inputContainer,
                {
                  backgroundColor: theme.backgroundElement,
                  borderColor: formError ? twd.danger : twd.border,
                },
              ]}>
              <TextInput
                style={[styles.textArea, { color: theme.text }]}
                placeholder="Meter reading, service condition, etc."
                placeholderTextColor={theme.textSecondary}
                value={fieldVerification}
                onChangeText={(text) => {
                  setFieldVerification(text);
                  if (formError) setFormError(null);
                }}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                accessibilityLabel="Field verification notes"
              />
            </View>

            {formError && (
              <View
                style={[
                  styles.formErrorBox,
                  { backgroundColor: twd.dangerSurface, borderColor: twd.danger },
                ]}
                accessibilityRole="alert"
                accessibilityLiveRegion="assertive">
                <Icon name="alert-triangle" size={18} color={twd.danger} />
                <ThemedText type="small" style={[styles.formErrorText, { color: twd.danger }]}>
                  {formError}
                </ThemedText>
              </View>
            )}

            <View style={styles.formActions}>
              <TwdButton
                label="Cancel"
                variant="secondary"
                onPress={() => {
                  setShowProcessForm(false);
                  setSelectedOrder(null);
                  setFieldVerification('');
                  setFormError(null);
                }}
                style={styles.cancelButton}
              />
              <TwdButton
                label="Complete"
                busy={savingOrder}
                busyLabel="Saving…"
                onPress={() => void handleProcessReconnection()}
                style={styles.completeButton}
                accessibilityHint="Marks this reconnection as done and saves it on this phone"
              />
            </View>
          </ThemedView>
        )}

        <ThemedView style={styles.ordersWrapper}>
          <ThemedText type="defaultBold" style={styles.sectionTitle}>
            Pending Reconnections
          </ThemedText>

          {pendingOrders.length === 0 && (
            <ListEmpty
              icon="file-check"
              title="No pending reconnections"
              body="Reconnection orders assigned to you will appear here, including while offline."
            />
          )}

          {pendingOrders.map((order) => (
            <ThemedView key={order.id} type="backgroundElement" style={styles.orderCard}>
              <ThemedView style={styles.cardHeader}>
                <ThemedView style={styles.headerText}>
                  <ThemedText type="defaultBold" style={styles.cardTitle}>
                    {order.accountNumber}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {order.accountName}
                  </ThemedText>
                </ThemedView>
                <ServiceOrderBadge status={order.status} />
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
                  <ThemedText type="defaultBold">{formatPeso(order.previousBalance)}</ThemedText>
                </ThemedView>
                <ThemedView style={styles.detailRow}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Settlement Amount
                  </ThemedText>
                  <ThemedText type="defaultBold" style={{ color: twd.success }}>
                    {formatPeso(order.settlementAmount)}
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
                <TwdButton
                  label="Process Reconnection"
                  onPress={() => {
                    setSelectedOrder(order);
                    setShowProcessForm(true);
                  }}
                  style={styles.cardActionButton}
                />
              </ThemedView>
            </ThemedView>
          ))}

          <ThemedText type="defaultBold" style={[styles.sectionTitle, styles.sectionTitleMargin]}>
            Completed Reconnections
          </ThemedText>

          {completedOrders.length === 0 && (
            <ListEmpty
              icon="check"
              title="Nothing completed yet"
              body="Orders you finish today will move down here."
            />
          )}

          {completedOrders.map((order) => (
            <ThemedView key={order.id} type="backgroundElement" style={styles.orderCard}>
              <ThemedView style={styles.cardHeader}>
                <ThemedView style={styles.headerText}>
                  <ThemedText type="defaultBold" style={styles.cardTitle}>
                    {order.accountNumber}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {order.accountName}
                  </ThemedText>
                </ThemedView>
                <ServiceOrderBadge status={order.status} />
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
                <TwdButton
                  label="Print Receipt"
                  icon="printer"
                  variant="secondary"
                  busy={printing}
                  busyLabel="Printing…"
                  onPress={() => void handlePrintReceipt(order)}
                  style={styles.cardActionButton}
                  accessibilityHint={`Prints the reconnection receipt for ${order.accountName}`}
                />
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
  summaryContainer: {
    flexDirection: 'row',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  summaryCard: {
    flex: 1,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.one,
    alignItems: 'center',
  },
  summaryNumber: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
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
  },
  orderInfo: {
    gap: Spacing.one,
  },
  inputContainer: {
    borderRadius: Radius.field,
    borderWidth: 2,
    padding: Spacing.three,
  },
  textArea: {
    fontSize: 16,
    minHeight: 80,
  },
  formErrorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.card,
    borderWidth: 2,
  },
  formErrorText: {
    flex: 1,
  },
  formActions: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  cancelButton: {
    flex: 1,
  },
  completeButton: {
    flex: 2,
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
  headerText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
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
  cardActionButton: {
    flex: 1,
  },
});
