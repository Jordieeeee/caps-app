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
    address: '24 Mabini Street, Brgy. Poblacion 3, Tanauan City',
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
    address: '117 J.P. Laurel Highway, Brgy. Darasa, Tanauan City',
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
    address: '8 Rizal Avenue, Brgy. Sambat, Tanauan City',
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

/**
 * Disconnection work orders. Title comes from the navigation header.
 *
 * The confirm action uses the danger variant deliberately: cutting a household's
 * water is the one thing in this app done *to* a customer, and the old filled-red
 * "Confirm Disconnection" made the gravest action the most visually dominant
 * element on screen — an invitation, not a caution. The outlined danger treatment
 * matches Sign out: serious, unmistakable, not shouting.
 */
export default function DisconnectionsScreen() {
  const insets = useStackContentInsets();
  const theme = useTheme();
  const twd = useTwdTheme();
  const { print, printing } = usePrint();

  const [orders, setOrders] = useState<DisconnectionOrder[]>(mockDisconnectionOrders);
  const [selectedOrder, setSelectedOrder] = useState<DisconnectionOrder | null>(null);
  const [showProcessForm, setShowProcessForm] = useState(false);
  const [fieldVerification, setFieldVerification] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);

  const pendingOrders = orders.filter((o) => o.status === 'pending');
  const completedOrders = orders.filter((o) => o.status === 'completed');
  const totalOutstanding = orders.reduce((sum, o) => sum + o.outstandingBalance, 0);

  // Silent `return` on missing notes was a dead button — same defect, same fix,
  // as Collections and Reconnections. For a disconnection the note matters even
  // more: seal number and final reading are what a dispute is settled with.
  const handleProcessDisconnection = async () => {
    setFormError(null);
    if (!selectedOrder) return;

    if (!fieldVerification.trim()) {
      setFormError(
        'Enter field verification notes first — final meter reading, seal number, and service condition.'
      );
      return;
    }

    const updatedOrder: DisconnectionOrder = {
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

  const handlePrintReceipt = (order: DisconnectionOrder) =>
    print(() => PrinterService.printServiceOrderReceipt({ ...order, type: 'disconnection' }));

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
              Outstanding
            </ThemedText>
            <ThemedText
              style={styles.summaryNumber}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.6}>
              {formatPeso(totalOutstanding)}
            </ThemedText>
          </ThemedView>
        </ThemedView>

        {showProcessForm && selectedOrder && (
          <ThemedView type="backgroundElement" style={styles.formContainer}>
            <ThemedText type="defaultBold" style={styles.formTitle}>
              Process Disconnection
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
              <ThemedText type="small" themeColor="textSecondary">
                Outstanding: {formatPeso(selectedOrder.outstandingBalance)}
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
                placeholder="Final meter reading, seal number, service condition…"
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
                label="Confirm Disconnection"
                variant="danger"
                busy={savingOrder}
                busyLabel="Saving…"
                onPress={() => void handleProcessDisconnection()}
                style={styles.completeButton}
                accessibilityHint="Records that this service was disconnected and saves it on this phone"
              />
            </View>
          </ThemedView>
        )}

        <ThemedView style={styles.ordersWrapper}>
          <ThemedText type="defaultBold" style={styles.sectionTitle}>
            Pending Disconnections
          </ThemedText>

          {pendingOrders.length === 0 && (
            <ListEmpty
              icon="alert-triangle"
              title="No pending disconnections"
              body="Authorized disconnection orders will appear here, including while offline."
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
                    Outstanding Balance
                  </ThemedText>
                  <ThemedText type="defaultBold" style={{ color: twd.danger }}>
                    {formatPeso(order.outstandingBalance)}
                  </ThemedText>
                </ThemedView>
                <ThemedView style={styles.detailRow}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Billing Status
                  </ThemedText>
                  <ThemedText
                    type="smallBold"
                    style={{
                      color: order.billingStatus === 'delinquent' ? twd.danger : twd.warning,
                    }}>
                    {order.billingStatus === 'delinquent' ? 'Delinquent' : 'Overdue'}
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
                <TwdButton
                  label="Process Disconnection"
                  variant="danger"
                  onPress={() => {
                    setSelectedOrder(order);
                    setShowProcessForm(true);
                  }}
                  style={styles.cardActionButton}
                  accessibilityHint="Opens the form to record this disconnection"
                />
              </ThemedView>
            </ThemedView>
          ))}

          <ThemedText type="defaultBold" style={[styles.sectionTitle, styles.sectionTitleMargin]}>
            Completed Disconnections
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
                  accessibilityHint={`Prints the disconnection receipt for ${order.accountName}`}
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
