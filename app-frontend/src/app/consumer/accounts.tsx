import { Platform, ScrollView, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface Account {
  id: string;
  accountNumber: string;
  address: string;
  type: 'residential' | 'commercial';
  status: 'active' | 'inactive';
  linkedDate: string;
}

const MAX_ACCOUNTS = 5;

const mockAccounts: Account[] = [
  {
    id: '1',
    accountNumber: 'WD-12345',
    address: '123 Main Street, Springfield, IL 62701',
    type: 'residential',
    status: 'active',
    linkedDate: '2024-01-15',
  },
  {
    id: '2',
    accountNumber: 'WD-67890',
    address: '456 Oak Avenue, Springfield, IL 62702',
    type: 'residential',
    status: 'active',
    linkedDate: '2024-03-20',
  },
];

function getStatusColor(status: string, theme: any) {
  switch (status) {
    case 'active':
      return '#34C759';
    case 'inactive':
      return '#8E8E93';
    default:
      return theme.text;
  }
}

function getTypeIcon(type: string) {
  switch (type) {
    case 'residential':
      return '🏠';
    case 'commercial':
      return '🏢';
    default:
      return '📁';
  }
}

export default function AccountsScreen() {
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

  const canAddAccount = mockAccounts.length < MAX_ACCOUNTS;

  return (
    <ScrollView
      style={[styles.scrollView, { backgroundColor: theme.background }]}
      contentInset={insets}
      contentContainerStyle={[styles.contentContainer, contentPlatformStyle]}>
      <ThemedView style={styles.container}>
        <ThemedView style={styles.titleContainer}>
          <ThemedText type="subtitle">Account Management</ThemedText>
          <ThemedText style={styles.centerText} themeColor="textSecondary">
            Manage your linked water district accounts (Maximum {MAX_ACCOUNTS} accounts)
          </ThemedText>
        </ThemedView>

        <ThemedView style={styles.statsContainer}>
          <ThemedView type="backgroundElement" style={styles.statCard}>
            <ThemedText type="small" themeColor="textSecondary">
              Linked Accounts
            </ThemedText>
            <ThemedText type="title" style={styles.statNumber}>
              {mockAccounts.length}/{MAX_ACCOUNTS}
            </ThemedText>
          </ThemedView>
          <ThemedView type="backgroundElement" style={styles.statCard}>
            <ThemedText type="small" themeColor="textSecondary">
              Active Accounts
            </ThemedText>
            <ThemedText type="title" style={styles.statNumber}>
              {mockAccounts.filter((a) => a.status === 'active').length}
            </ThemedText>
          </ThemedView>
        </ThemedView>

        {canAddAccount && (
          <ThemedView style={styles.addAccountContainer}>
            <TouchableOpacity
              style={[styles.addButton, { backgroundColor: theme.backgroundElement }]}
              onPress={() => {}}>
              <ThemedText type="defaultBold" style={styles.addButtonText}>
                + Link New Account
              </ThemedText>
            </TouchableOpacity>
          </ThemedView>
        )}

        <ThemedView style={styles.accountsWrapper}>
          <ThemedText type="defaultBold" style={styles.sectionTitle}>
            Your Accounts
          </ThemedText>
          {mockAccounts.map((account) => (
            <ThemedView key={account.id} type="backgroundElement" style={styles.accountCard}>
              <ThemedView style={styles.cardHeader}>
                <ThemedText style={styles.typeIcon}>
                  {getTypeIcon(account.type)}
                </ThemedText>
                <ThemedView style={styles.headerText}>
                  <ThemedText type="defaultBold" style={styles.cardTitle}>
                    {account.accountNumber}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {account.address}
                  </ThemedText>
                </ThemedView>
                <ThemedView
                  style={[
                    styles.statusBadge,
                    { backgroundColor: getStatusColor(account.status, theme) + '20' },
                  ]}>
                  <ThemedText
                    type="small"
                    style={[
                      styles.statusText,
                      { color: getStatusColor(account.status, theme) },
                    ]}>
                    {account.status.toUpperCase()}
                  </ThemedText>
                </ThemedView>
              </ThemedView>
              <ThemedView style={styles.cardDetails}>
                <ThemedView style={styles.detailRow}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Type
                  </ThemedText>
                  <ThemedText type="small">{account.type.charAt(0).toUpperCase() + account.type.slice(1)}</ThemedText>
                </ThemedView>
                <ThemedView style={styles.detailRow}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Linked Date
                  </ThemedText>
                  <ThemedText type="small">{account.linkedDate}</ThemedText>
                </ThemedView>
              </ThemedView>
              <ThemedView style={styles.cardActions}>
                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: theme.backgroundElement }]}>
                  <ThemedText type="small">Manage</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: '#FF3B30' + '20' }]}>
                  <ThemedText type="small" style={{ color: '#FF3B30' }}>
                    Unlink
                  </ThemedText>
                </TouchableOpacity>
              </ThemedView>
            </ThemedView>
          ))}
        </ThemedView>

        {!canAddAccount && (
          <ThemedView type="backgroundElement" style={styles.limitWarning}>
            <ThemedText type="small" style={styles.warningText}>
              ⚠️ You have reached the maximum number of linked accounts ({MAX_ACCOUNTS}).
              Please contact support if you need to link additional accounts.
            </ThemedText>
          </ThemedView>
        )}
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
  statsContainer: {
    flexDirection: 'row',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  statCard: {
    flex: 1,
    borderRadius: Spacing.three,
    padding: Spacing.four,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  addAccountContainer: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  addButton: {
    borderRadius: Spacing.three,
    padding: Spacing.four,
    alignItems: 'center',
  },
  addButtonText: {
    fontSize: 16,
  },
  accountsWrapper: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  sectionTitle: {
    fontSize: 18,
  },
  accountCard: {
    borderRadius: Spacing.three,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  typeIcon: {
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
  cardActions: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingTop: Spacing.two,
  },
  actionButton: {
    flex: 1,
    borderRadius: Spacing.two,
    padding: Spacing.two,
    alignItems: 'center',
  },
  limitWarning: {
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.four,
    borderRadius: Spacing.three,
    padding: Spacing.four,
  },
  warningText: {
    textAlign: 'center',
  },
});
