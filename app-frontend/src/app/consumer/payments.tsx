import { Platform, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface PaymentNotification {
  id: string;
  accountNumber: string;
  accountAddress: string;
  amount: number;
  dueDate: string;
  daysUntilDue: number;
  status: 'urgent' | 'upcoming' | 'safe';
  recommendation: string;
  recommendedAction: 'pay-now' | 'schedule-payment' | 'setup-autopay';
}

const mockNotifications: PaymentNotification[] = [
  {
    id: '1',
    accountNumber: 'WD-12345',
    accountAddress: '123 Main Street, Springfield, IL 62701',
    amount: 45.50,
    dueDate: '2025-07-20',
    daysUntilDue: 5,
    status: 'urgent',
    recommendation: 'Payment due in 5 days. To avoid late fees, we recommend processing payment today.',
    recommendedAction: 'pay-now',
  },
  {
    id: '2',
    accountNumber: 'WD-67890',
    accountAddress: '456 Oak Avenue, Springfield, IL 62702',
    amount: 38.75,
    dueDate: '2025-08-15',
    daysUntilDue: 31,
    status: 'upcoming',
    recommendation: 'Next payment due in 31 days. Consider setting up autopay for convenience.',
    recommendedAction: 'setup-autopay',
  },
];

function getStatusColor(status: string, theme: any) {
  switch (status) {
    case 'urgent':
      return '#FF3B30';
    case 'upcoming':
      return '#FF9500';
    case 'safe':
      return '#34C759';
    default:
      return theme.text;
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'urgent':
      return 'URGENT';
    case 'upcoming':
      return 'UPCOMING';
    case 'safe':
      return 'ON TRACK';
    default:
      return status.toUpperCase();
  }
}

function getActionText(action: string) {
  switch (action) {
    case 'pay-now':
      return 'Pay Now';
    case 'schedule-payment':
      return 'Schedule Payment';
    case 'setup-autopay':
      return 'Setup Autopay';
    default:
      return 'Take Action';
  }
}

function getActionColor(action: string) {
  switch (action) {
    case 'pay-now':
      return '#34C759';
    case 'schedule-payment':
      return '#007AFF';
    case 'setup-autopay':
      return '#5856D6';
    default:
      return '#007AFF';
  }
}

export default function PaymentsScreen() {
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

  const totalDue = mockNotifications.reduce((sum, notif) => sum + notif.amount, 0);
  const urgentCount = mockNotifications.filter((n) => n.status === 'urgent').length;

  return (
    <ScrollView
      style={[styles.scrollView, { backgroundColor: theme.background }]}
      contentInset={insets}
      contentContainerStyle={[styles.contentContainer, contentPlatformStyle]}>
      <ThemedView style={styles.container}>
        <ThemedView style={styles.titleContainer}>
          <ThemedText type="subtitle">Payment Notifications</ThemedText>
          <ThemedText style={styles.centerText} themeColor="textSecondary">
            Stay on top of your payments with timely reminders and recommendations.
          </ThemedText>
        </ThemedView>

        <ThemedView style={styles.summaryContainer}>
          <ThemedView type="backgroundElement" style={styles.summaryCard}>
            <ThemedText type="small" themeColor="textSecondary">
              Total Due
            </ThemedText>
            <ThemedText type="title" style={styles.summaryAmount}>
              ₱{totalDue.toFixed(2)}
            </ThemedText>
          </ThemedView>
          <ThemedView type="backgroundElement" style={styles.summaryCard}>
            <ThemedText type="small" themeColor="textSecondary">
              Urgent Payments
            </ThemedText>
            <ThemedText type="title" style={[styles.summaryAmount, { color: '#FF3B30' }]}>
              {urgentCount}
            </ThemedText>
          </ThemedView>
        </ThemedView>

        <ThemedView style={styles.notificationsWrapper}>
          <ThemedText type="defaultBold" style={styles.sectionTitle}>
            Payment Reminders
          </ThemedText>
          {mockNotifications.map((notification) => (
            <ThemedView
              key={notification.id}
              type="backgroundElement"
              style={styles.notificationCard}>
              <ThemedView style={styles.cardHeader}>
                <ThemedView style={styles.headerText}>
                  <ThemedText type="defaultBold" style={styles.cardTitle}>
                    {notification.accountNumber}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {notification.accountAddress}
                  </ThemedText>
                </ThemedView>
                <ThemedView
                  style={[
                    styles.statusBadge,
                    { backgroundColor: getStatusColor(notification.status, theme) + '20' },
                  ]}>
                  <ThemedText
                    type="small"
                    style={[
                      styles.statusText,
                      { color: getStatusColor(notification.status, theme) },
                    ]}>
                    {getStatusBadge(notification.status)}
                  </ThemedText>
                </ThemedView>
              </ThemedView>

              <ThemedView style={styles.cardDetails}>
                <ThemedView style={styles.detailRow}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Amount Due
                  </ThemedText>
                  <ThemedText type="defaultBold">₱{notification.amount.toFixed(2)}</ThemedText>
                </ThemedView>
                <ThemedView style={styles.detailRow}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Due Date
                  </ThemedText>
                  <ThemedText type="small">{notification.dueDate}</ThemedText>
                </ThemedView>
                <ThemedView style={styles.detailRow}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Days Until Due
                  </ThemedText>
                  <ThemedText
                    type="small"
                    style={{
                      color: notification.daysUntilDue <= 7 ? '#FF3B30' : theme.text,
                      fontWeight: 'bold',
                    }}>
                    {notification.daysUntilDue} days
                  </ThemedText>
                </ThemedView>
              </ThemedView>

              <ThemedView type="backgroundElement" style={styles.recommendationBox}>
                <ThemedText type="small" style={styles.recommendationLabel}>
                  💡 Recommendation
                </ThemedText>
                <ThemedText type="small" style={styles.recommendationText}>
                  {notification.recommendation}
                </ThemedText>
              </ThemedView>

              <TouchableOpacity
                style={[
                  styles.actionButton,
                  { backgroundColor: getActionColor(notification.recommendedAction) },
                ]}>
                <ThemedText type="defaultBold" style={styles.actionButtonText}>
                  {getActionText(notification.recommendedAction)}
                </ThemedText>
              </TouchableOpacity>
            </ThemedView>
          ))}
        </ThemedView>

        <ThemedView type="backgroundElement" style={styles.tipBox}>
          <ThemedText type="defaultBold" style={styles.tipTitle}>
            💡 Payment Tips
          </ThemedText>
          <ThemedText type="small" style={styles.tipText}>
            • Set up autopay to never miss a payment deadline
          </ThemedText>
          <ThemedText type="small" style={styles.tipText}>
            • Pay at least 3 days before the due date to account for processing time
          </ThemedText>
          <ThemedText type="small" style={styles.tipText}>
            • Contact us immediately if you need a payment extension
          </ThemedText>
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
  notificationsWrapper: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  sectionTitle: {
    fontSize: 18,
  },
  notificationCard: {
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
  recommendationBox: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  recommendationLabel: {
    fontWeight: 'bold',
  },
  recommendationText: {
    lineHeight: 18,
  },
  actionButton: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  tipBox: {
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.four,
    borderRadius: Spacing.three,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  tipTitle: {
    fontSize: 16,
  },
  tipText: {
    lineHeight: 20,
  },
});
