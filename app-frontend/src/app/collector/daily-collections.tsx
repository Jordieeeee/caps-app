import { Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { useState } from 'react';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { OfflineStorage } from '@/collector/services/offline-storage';
import { PrinterService } from '@/collector/services/printer-service';
import { formatPeso } from '@/shared/format/currency';
import { FilterChips } from '@/shared/components/filter-chips';
import { Icon, type IconName } from '@/shared/components/icon';
import { ListEmpty } from '@/shared/components/list-states';
import { ScreenHeader } from '@/shared/components/screen-header';
import { SyncBadge } from '@/shared/components/status-badge';
import { TwdButton } from '@/shared/components/twd-button';
import { useContentInsetsWithTopSpacing } from '@/shared/hooks/use-content-insets';
import { usePrint } from '@/shared/hooks/use-print';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { MIN_TAP_TARGET, Radius } from '@/shared/theme/twd';

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

/**
 * Payment method presentation, in one place.
 *
 * These were emoji — 💵 for cash, 📝 for check, 💳 for electronic — rendered at
 * fontSize 24 as the card's primary visual. Emoji are the wrong tool for a
 * functional icon: they are a different vendor's artwork on every OS, they ignore
 * the theme because they carry their own colour, and a screen reader announces 💵
 * as "money with wings", which is not what a cash payment is called. The Lucide
 * set draws in the current text colour and says the same thing on every device.
 */
const METHOD_ICON: Record<Collection['paymentMethod'], IconName> = {
  cash: 'banknote',
  check: 'file-text',
  electronic: 'credit-card',
};

const METHOD_LABEL: Record<Collection['paymentMethod'], string> = {
  cash: 'Cash',
  check: 'Check',
  electronic: 'Electronic',
};

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
    amount: 486.00,
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
    amount: 452.75,
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
    amount: 1248.50,
    paymentMethod: 'electronic',
    referenceNumber: 'REF-789012',
    collectionDate: '2025-07-15',
    timestamp: Date.now(),
    synced: true,
  },
];

export default function DailyCollectionsScreen() {
  const insets = useContentInsetsWithTopSpacing();
  const theme = useTheme();
  const twd = useTwdTheme();
  const { print, printing } = usePrint();

  const [collections, setCollections] = useState<Collection[]>(mockCollections);
  const [selectedCollectorId, setSelectedCollectorId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  
  // Form state
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'check' | 'electronic'>('cash');
  const [checkNumber, setCheckNumber] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');

  const selectedCollector = mockCollectors.find((c) => c.id === selectedCollectorId) ?? null;
  const filteredCollections = selectedCollectorId
    ? collections.filter((c) => c.collectorId === selectedCollectorId)
    : collections;

  const totalCollected = filteredCollections.reduce((sum, c) => sum + c.amount, 0);
  const cashCollections = filteredCollections.filter(c => c.paymentMethod === 'cash');
  const checkCollections = filteredCollections.filter(c => c.paymentMethod === 'check');
  const electronicCollections = filteredCollections.filter(c => c.paymentMethod === 'electronic');

  /**
   * Validation used to be `if (!a || !b || !c) return;` — a bare early return with
   * no state change, so tapping Save on an incomplete form did nothing at all: no
   * message, no highlight, no movement. A field worker reads a dead button as a
   * broken app and taps it again. The skill's UX guidance names this exactly
   * ("Submit Feedback — don't: no feedback after submit"), and a silent failure is
   * worse here than elsewhere, because the collector has cash in hand and needs to
   * know whether it was recorded.
   *
   * The save error path had the same problem one level down: `catch` logged to a
   * console nobody in the field can read, and the form quietly stayed put.
   */
  const handleAddCollection = async () => {
    setFormError(null);

    const missing: string[] = [];
    if (!accountNumber.trim()) missing.push('account number');
    if (!accountName.trim()) missing.push('account name');
    if (!amount.trim()) missing.push('amount');
    if (missing.length) {
      setFormError(`Enter the ${missing.join(', ')} before saving.`);
      return;
    }

    const parsed = Number.parseFloat(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setFormError('Enter an amount greater than zero.');
      return;
    }

    setSaving(true);
    const newCollection: Collection = {
      id: Date.now().toString(),
      collectorId: selectedCollector?.id || 'COL-001',
      accountNumber,
      accountName,
      amount: parsed,
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
    } catch {
      setFormError(
        'Could not save this collection to the phone. Do not hand over a receipt — try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  // Both print paths route through usePrint: same preflight (Bluetooth off vs no
  // printer, with a deep link to printer settings), same "the record is saved
  // either way" reassurance, same busy state on the buttons.
  const handlePrintReceipt = (collection: Collection) =>
    print(() => PrinterService.printCollectionReceipt(collection));

  const handlePrintDailyReport = () =>
    print(() =>
      PrinterService.print({
        type: 'report',
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
      })
    );

  return (
    <ScrollView
      style={[styles.scrollView, { backgroundColor: theme.background }]}
      contentContainerStyle={[styles.contentContainer, insets]}>
      <ThemedView style={styles.container}>
        <ScreenHeader title="Collections" subtitle="Today's payments, cash counted as you go" />

        <ThemedView style={styles.collectorSelector}>
          <ThemedText type="defaultBold" style={styles.sectionTitle}>
            Select Collector
          </ThemedText>
          <FilterChips
            chips={mockCollectors.map((c) => ({ id: c.id, label: c.name }))}
            selectedId={selectedCollectorId}
            onSelect={setSelectedCollectorId}
            allLabel="All Collectors"
            accessibilityLabel="Filter collections by collector"
          />
        </ThemedView>

        <ThemedView style={styles.summaryContainer}>
          <ThemedView type="backgroundElement" style={styles.summaryCard}>
            <ThemedText type="small" themeColor="textSecondary">
              Total Collected
            </ThemedText>
            <ThemedText
              style={styles.summaryAmount}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}>
              {formatPeso(totalCollected)}
            </ThemedText>
          </ThemedView>
          <ThemedView type="backgroundElement" style={styles.summaryCard}>
            <ThemedText type="small" themeColor="textSecondary">
              Transactions
            </ThemedText>
            <ThemedText style={styles.summaryNumber} numberOfLines={1}>
              {filteredCollections.length}
            </ThemedText>
          </ThemedView>
        </ThemedView>

        <ThemedView style={styles.actionsContainer}>
          <TwdButton
            label={showAddForm ? 'Cancel' : 'Add Collection'}
            variant={showAddForm ? 'secondary' : 'primary'}
            onPress={() => setShowAddForm(!showAddForm)}
            style={styles.actionButton}
          />
          <TwdButton
            label="Daily Report"
            icon="printer"
            variant="secondary"
            busy={printing}
            busyLabel="Printing…"
            onPress={() => void handlePrintDailyReport()}
            style={styles.actionButton}
          />
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
              {(['cash', 'check', 'electronic'] as const).map((method) => {
                const selected = paymentMethod === method;
                return (
                  <Pressable
                    key={method}
                    onPress={() => setPaymentMethod(method)}
                    accessibilityRole="button"
                    accessibilityLabel={METHOD_LABEL[method]}
                    accessibilityState={{ selected }}
                    style={({ pressed }) => [
                      styles.methodChip,
                      {
                        borderColor: selected ? twd.primary : twd.border,
                        backgroundColor: selected
                          ? twd.primarySubtle
                          : pressed
                            ? twd.backgroundSelected
                            : 'transparent',
                      },
                    ]}>
                    <Icon
                      name={METHOD_ICON[method]}
                      size={18}
                      color={selected ? twd.primary : twd.textSecondary}
                    />
                    <ThemedText
                      type="small"
                      style={selected ? { color: twd.primary } : undefined}>
                      {METHOD_LABEL[method]}
                    </ThemedText>
                  </Pressable>
                );
              })}
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

            {formError && (
              <ThemedView
                style={[
                  styles.formError,
                  { backgroundColor: twd.dangerSurface, borderColor: twd.danger },
                ]}
                accessibilityRole="alert"
                accessibilityLiveRegion="assertive">
                <Icon name="alert-triangle" size={18} color={twd.danger} />
                <ThemedText type="small" style={[styles.formErrorText, { color: twd.danger }]}>
                  {formError}
                </ThemedText>
              </ThemedView>
            )}

            <TwdButton label="Save Collection" busy={saving} busyLabel="Saving…" onPress={() => void handleAddCollection()} />
          </ThemedView>
        )}

        <ThemedView style={styles.collectionsWrapper}>
          <ThemedText type="defaultBold" style={styles.sectionTitle}>
            Today&apos;s Collections
          </ThemedText>
          {filteredCollections.length === 0 && (
            <ListEmpty
              icon="banknote"
              title="No collections yet today"
              body={
                selectedCollector
                  ? `Nothing recorded for ${selectedCollector.name} today. Collections you add are saved on this phone straight away.`
                  : 'Nothing recorded yet today. Collections you add are saved on this phone straight away, with or without signal.'
              }
              action={{ label: 'Add Collection', onPress: () => setShowAddForm(true) }}
            />
          )}

          {filteredCollections.map((collection) => (
            <ThemedView key={collection.id} type="backgroundElement" style={styles.collectionCard}>
              <ThemedView style={styles.cardHeader}>
                <Icon name={METHOD_ICON[collection.paymentMethod]} size={24} color={twd.primary} />
                <ThemedView style={styles.headerText}>
                  <ThemedText type="defaultBold" style={styles.cardTitle}>
                    {collection.accountNumber}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {collection.accountName}
                  </ThemedText>
                </ThemedView>
                <SyncBadge status={collection.synced ? 'synced' : 'pending'} />
              </ThemedView>

              <ThemedView style={styles.cardDetails}>
                <ThemedView style={styles.detailRow}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Amount
                  </ThemedText>
                  <ThemedText type="defaultBold">{formatPeso(collection.amount)}</ThemedText>
                </ThemedView>
                <ThemedView style={styles.detailRow}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Method
                  </ThemedText>
                  <ThemedText type="small">{METHOD_LABEL[collection.paymentMethod]}</ThemedText>
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
                <TwdButton
                  label="Print Receipt"
                  icon="printer"
                  variant="secondary"
                  busy={printing}
                  busyLabel="Printing…"
                  onPress={() => void handlePrintReceipt(collection)}
                  style={styles.receiptButton}
                  accessibilityHint={`Prints a receipt for ${collection.accountName} on the thermal printer`}
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
  collectorSelector: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  sectionTitle: {
    fontSize: 16,
    marginBottom: Spacing.two,
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
  // fontSize with its own lineHeight — see the note in service-reports.tsx. These
  // previously inherited `title`'s 52px line box onto a 20px glyph.
  summaryAmount: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
  },
  summaryNumber: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
  },
  actionsContainer: {
    flexDirection: 'row',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  actionButton: {
    flex: 1,
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
    // Was padding: 8 around 20px text — a 36px target against the 48dp floor these
    // get tapped at one-handed, in the rain, wearing gloves.
    minHeight: MIN_TAP_TARGET,
    borderRadius: Radius.field,
    paddingHorizontal: Spacing.two,
    gap: Spacing.one,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  formError: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.card,
    borderWidth: 2,
  },
  formErrorText: { flex: 1 },
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
  cardActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  receiptButton: {
    flex: 1,
  },
});
