import { Platform, ScrollView, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState } from 'react';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { OfflineStorage } from '@/services/collector/offline-storage';
import { PrinterService } from '@/services/collector/printer-service';

interface Collection {
  id: string;
  collectorId: string;
  accountNumber: string;
  accountName: string;
  amount: number;
  paymentMethod: 'cash' | 'check' | 'electronic';
  checkNumber?: string;
  referenceNumber?: string;
  collectionDate: string;
  timestamp: number;
  synced: boolean;
}

interface Collector {
  id: string;
  name: string;
  route: string;
}

const mockCollectors: Collector[] = [
  { id: 'COL-001', name: 'Juan Dela Cruz', route: 'Downtown Route' },
  { id: 'COL-002', name: 'Maria Santos', route: 'Residential North' },
  { id: 'COL-003', name: 'Pedro Reyes', route: 'Industrial Zone' },
];

const mockCollections: Collection[] = [
  {
    id: '1',
    collectorId: 'COL-001',
    accountNumber: 'WD-12345',
    accountName: 'Carlos Garcia',
    amount: 45.50,
    paymentMethod: 'cash',
    collectionDate: '2025-07-15',
    timestamp: Date.now(),
    synced: false,
  },
  {
    id: '2',
    collectorId: 'COL-001',
    accountNumber: 'WD-12346',
    accountName: 'Ana Martinez',
    amount: 38.75,
    paymentMethod: 'check',
    checkNumber: '123456',
    collectionDate: '2025-07-15',
    timestamp: Date.now(),
    synced: false,
  },
  {
    id: '3',
    collectorId: 'COL-002',
    accountNumber: 'WD-12347',
    accountName: 'Roberto Rodriguez',
    amount: 52.25,
    paymentMethod: 'electronic',
    referenceNumber: 'REF-789012',
    collectionDate: '2025-07-15',
    timestamp: Date.now(),
    synced: true,
  },
];

export default function DailyCollectionsScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const insets = {
    ...safeAreaInsets,
    bottom: safeAreaInsets.bottom + BottomTabInset + Spacing.three,
  };
  const theme = useTheme();
  
  const [collections, setCollections] = useState<Collection[]>(mockCollections);
  const [selectedCollector, setSelectedCollector] = useState<Collector | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  
  // Form state
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'check' | 'electronic'>('cash');
  const [checkNumber, setCheckNumber] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');

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

  const filteredCollections = selectedCollector
    ? collections.filter(c => c.collectorId === selectedCollector.id)
    : collections;

  const totalCollected = filteredCollections.reduce((sum, c) => sum + c.amount, 0);
  const cashCollections = filteredCollections.filter(c => c.paymentMethod === 'cash');
  const checkCollections = filteredCollections.filter(c => c.paymentMethod === 'check');
  const electronicCollections = filteredCollections.filter(c => c.paymentMethod === 'electronic');

  const handleAddCollection = async () => {
    if (!accountNumber || !accountName || !amount) {
      return; // Validation failed
    }

    const newCollection: Collection = {
      id: Date.now().toString(),
      collectorId: selectedCollector?.id || 'COL-001',
      accountNumber,
      accountName,
      amount: parseFloat(amount),
      paymentMethod,
      checkNumber: paymentMethod === 'check' ? checkNumber : undefined,
      referenceNumber: paymentMethod === 'electronic' ? referenceNumber : undefined,
      collectionDate: new Date().toISOString().split('T')[0],
      timestamp: Date.now(),
      synced: false,
    };

    try {
      await OfflineStorage.saveCollection(newCollection);
      setCollections([...collections, newCollection]);
      
      // Reset form
      setAccountNumber('');
      setAccountName('');
      setAmount('');
      setCheckNumber('');
      setReferenceNumber('');
      setShowAddForm(false);
    } catch (error) {
      console.error('Error saving collection:', error);
    }
  };

  const handlePrintReceipt = async (collection: Collection) => {
    try {
      await PrinterService.printCollectionReceipt(collection);
    } catch (error) {
      console.error('Error printing receipt:', error);
    }
  };

  const handlePrintDailyReport = async () => {
    try {
      const printData = {
        type: 'report' as const,
        title: 'DAILY COLLECTIONS REPORT',
        content: [
          `Date: ${new Date().toLocaleDateString()}`,
          `Collector: ${selectedCollector?.name || 'All Collectors'}`,
          `Total Collections: ${filteredCollections.length}`,
          `Total Amount: ₱${totalCollected.toFixed(2)}`,
          '--------------------------------',
          `Cash: ₱${cashCollections.reduce((sum, c) => sum + c.amount, 0).toFixed(2)} (${cashCollections.length})`,
          `Checks: ₱${checkCollections.reduce((sum, c) => sum + c.amount, 0).toFixed(2)} (${checkCollections.length})`,
          `Electronic: ₱${electronicCollections.reduce((sum, c) => sum + c.amount, 0).toFixed(2)} (${electronicCollections.length})`,
        ],
        footer: 'End of Daily Report',
      };
      await PrinterService.print(printData);
    } catch (error) {
      console.error('Error printing report:', error);
    }
  };

  const getPaymentMethodIcon = (method: string) => {
    switch (method) {
      case 'cash':
        return '💵';
      case 'check':
        return '📝';
      case 'electronic':
        return '💳';
      default:
        return '💰';
    }
  };

  return (
    <ScrollView
      style={[styles.scrollView, { backgroundColor: theme.background }]}
      contentInset={insets}
      contentContainerStyle={[styles.contentContainer, contentPlatformStyle]}>
      <ThemedView style={styles.container}>
        <ThemedView style={styles.titleContainer}>
          <ThemedText type="subtitle">Daily Collections</ThemedText>
          <ThemedText style={styles.centerText} themeColor="textSecondary">
            Record and consolidate daily collections from field collectors.
          </ThemedText>
        </ThemedView>

        <ThemedView style={styles.collectorSelector}>
          <ThemedText type="defaultBold" style={styles.sectionTitle}>
            Select Collector
          </ThemedText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.collectorScroll}>
            <TouchableOpacity
              style={[
                styles.collectorChip,
                !selectedCollector && { backgroundColor: theme.backgroundElement },
              ]}
              onPress={() => setSelectedCollector(null)}>
              <ThemedText type="small">All Collectors</ThemedText>
            </TouchableOpacity>
            {mockCollectors.map((collector) => (
              <TouchableOpacity
                key={collector.id}
                style={[
                  styles.collectorChip,
                  selectedCollector?.id === collector.id && {
                    backgroundColor: theme.backgroundElement,
                  },
                ]}
                onPress={() => setSelectedCollector(collector)}>
                <ThemedText type="small">{collector.name}</ThemedText>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </ThemedView>

        <ThemedView style={styles.summaryContainer}>
          <ThemedView type="backgroundElement" style={styles.summaryCard}>
            <ThemedText type="small" themeColor="textSecondary">
              Total Collected
            </ThemedText>
            <ThemedText type="title" style={styles.summaryAmount}>
              ₱{totalCollected.toFixed(2)}
            </ThemedText>
          </ThemedView>
          <ThemedView type="backgroundElement" style={styles.summaryCard}>
            <ThemedText type="small" themeColor="textSecondary">
              Transactions
            </ThemedText>
            <ThemedText type="title" style={styles.summaryNumber}>
              {filteredCollections.length}
            </ThemedText>
          </ThemedView>
        </ThemedView>

        <ThemedView style={styles.actionsContainer}>
          <TouchableOpacity
            style={[styles.addButton, { backgroundColor: theme.backgroundElement }]}
            onPress={() => setShowAddForm(!showAddForm)}>
            <ThemedText type="defaultBold">
              {showAddForm ? 'Cancel' : '+ Add Collection'}
            </ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.printButton, { backgroundColor: theme.backgroundElement }]}
            onPress={handlePrintDailyReport}>
            <ThemedText type="defaultBold">🖨️ Daily Report</ThemedText>
          </TouchableOpacity>
        </ThemedView>

        {showAddForm && (
          <ThemedView type="backgroundElement" style={styles.formContainer}>
            <ThemedText type="defaultBold" style={styles.formTitle}>
              Add New Collection
            </ThemedText>
            
            <ThemedText type="small" themeColor="textSecondary">
              Account Number
            </ThemedText>
            <ThemedView type="backgroundElement" style={styles.inputContainer}>
              <TextInput
                style={[styles.input, { color: theme.text }]}
                placeholder="Enter account number"
                placeholderTextColor={theme.textSecondary}
                value={accountNumber}
                onChangeText={setAccountNumber}
              />
            </ThemedView>

            <ThemedText type="small" themeColor="textSecondary">
              Account Name
            </ThemedText>
            <ThemedView type="backgroundElement" style={styles.inputContainer}>
              <TextInput
                style={[styles.input, { color: theme.text }]}
                placeholder="Enter account name"
                placeholderTextColor={theme.textSecondary}
                value={accountName}
                onChangeText={setAccountName}
              />
            </ThemedView>

            <ThemedText type="small" themeColor="textSecondary">
              Amount (₱)
            </ThemedText>
            <ThemedView type="backgroundElement" style={styles.inputContainer}>
              <TextInput
                style={[styles.input, { color: theme.text }]}
                placeholder="0.00"
                placeholderTextColor={theme.textSecondary}
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
              />
            </ThemedView>

            <ThemedText type="small" themeColor="textSecondary">
              Payment Method
            </ThemedText>
            <ThemedView style={styles.paymentMethodContainer}>
              {(['cash', 'check', 'electronic'] as const).map((method) => (
                <TouchableOpacity
                  key={method}
                  style={[
                    styles.methodChip,
                    paymentMethod === method && {
                      backgroundColor: theme.backgroundElement,
                    },
                  ]}
                  onPress={() => setPaymentMethod(method)}>
                  <ThemedText type="small">{getPaymentMethodIcon(method)} {method.toUpperCase()}</ThemedText>
                </TouchableOpacity>
              ))}
            </ThemedView>

            {paymentMethod === 'check' && (
              <>
                <ThemedText type="small" themeColor="textSecondary">
                  Check Number
                </ThemedText>
                <ThemedView type="backgroundElement" style={styles.inputContainer}>
                  <TextInput
                    style={[styles.input, { color: theme.text }]}
                    placeholder="Enter check number"
                    placeholderTextColor={theme.textSecondary}
                    value={checkNumber}
                    onChangeText={setCheckNumber}
                  />
                </ThemedView>
              </>
            )}

            {paymentMethod === 'electronic' && (
              <>
                <ThemedText type="small" themeColor="textSecondary">
                  Reference Number
                </ThemedText>
                <ThemedView type="backgroundElement" style={styles.inputContainer}>
                  <TextInput
                    style={[styles.input, { color: theme.text }]}
                    placeholder="Enter reference number"
                    placeholderTextColor={theme.textSecondary}
                    value={referenceNumber}
                    onChangeText={setReferenceNumber}
                  />
                </ThemedView>
              </>
            )}

            <TouchableOpacity
              style={[styles.submitButton, { backgroundColor: theme.backgroundElement }]}
              onPress={handleAddCollection}>
              <ThemedText type="defaultBold">Save Collection</ThemedText>
            </TouchableOpacity>
          </ThemedView>
        )}

        <ThemedView style={styles.collectionsWrapper}>
          <ThemedText type="defaultBold" style={styles.sectionTitle}>
            Today's Collections
          </ThemedText>
          {filteredCollections.map((collection) => (
            <ThemedView key={collection.id} type="backgroundElement" style={styles.collectionCard}>
              <ThemedView style={styles.cardHeader}>
                <ThemedText style={styles.methodIcon}>
                  {getPaymentMethodIcon(collection.paymentMethod)}
                </ThemedText>
                <ThemedView style={styles.headerText}>
                  <ThemedText type="defaultBold" style={styles.cardTitle}>
                    {collection.accountNumber}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {collection.accountName}
                  </ThemedText>
                </ThemedView>
                <ThemedView
                  style={[
                    styles.syncBadge,
                    {
                      backgroundColor: collection.synced ? '#34C75920' : '#FF950020',
                    },
                  ]}>
                  <ThemedText
                    type="small"
                    style={[
                      styles.syncText,
                      { color: collection.synced ? '#34C759' : '#FF9500' },
                    ]}>
                    {collection.synced ? 'SYNCED' : 'PENDING'}
                  </ThemedText>
                </ThemedView>
              </ThemedView>

              <ThemedView style={styles.cardDetails}>
                <ThemedView style={styles.detailRow}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Amount
                  </ThemedText>
                  <ThemedText type="defaultBold">₱{collection.amount.toFixed(2)}</ThemedText>
                </ThemedView>
                <ThemedView style={styles.detailRow}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Method
                  </ThemedText>
                  <ThemedText type="small">{collection.paymentMethod.toUpperCase()}</ThemedText>
                </ThemedView>
                {collection.checkNumber && (
                  <ThemedView style={styles.detailRow}>
                    <ThemedText type="small" themeColor="textSecondary">
                      Check # 
                    </ThemedText>
                    <ThemedText type="small">{collection.checkNumber}</ThemedText>
                  </ThemedView>
                )}
                {collection.referenceNumber && (
                  <ThemedView style={styles.detailRow}>
                    <ThemedText type="small" themeColor="textSecondary">
                      Reference
                    </ThemedText>
                    <ThemedText type="small">{collection.referenceNumber}</ThemedText>
                  </ThemedView>
                )}
              </ThemedView>

              <ThemedView style={styles.cardActions}>
                <TouchableOpacity
                  style={[styles.printReceiptButton, { backgroundColor: theme.backgroundElement }]}
                  onPress={() => handlePrintReceipt(collection)}>
                  <ThemedText type="small">🖨️ Receipt</ThemedText>
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
  collectorSelector: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  sectionTitle: {
    fontSize: 16,
    marginBottom: Spacing.two,
  },
  collectorScroll: {
    flexDirection: 'row',
  },
  collectorChip: {
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
  actionsContainer: {
    flexDirection: 'row',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  addButton: {
    flex: 1,
    borderRadius: Spacing.three,
    padding: Spacing.four,
    alignItems: 'center',
  },
  printButton: {
    flex: 1,
    borderRadius: Spacing.three,
    padding: Spacing.four,
    alignItems: 'center',
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
  inputContainer: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
  },
  input: {
    fontSize: 16,
  },
  paymentMethodContainer: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  methodChip: {
    flex: 1,
    borderRadius: Spacing.two,
    padding: Spacing.two,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  submitButton: {
    borderRadius: Spacing.three,
    padding: Spacing.four,
    alignItems: 'center',
  },
  collectionsWrapper: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  collectionCard: {
    borderRadius: Spacing.three,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  methodIcon: {
    fontSize: 24,
  },
  headerText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
  },
  syncBadge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.two,
  },
  syncText: {
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
  },
  printReceiptButton: {
    flex: 1,
    borderRadius: Spacing.two,
    padding: Spacing.two,
    alignItems: 'center',
  },
});
