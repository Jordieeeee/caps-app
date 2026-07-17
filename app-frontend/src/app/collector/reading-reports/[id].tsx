import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { newClientId } from '@/collector/services/client-id';
import { OfflineStorage } from '@/collector/services/offline-storage';
import { PrinterService } from '@/collector/services/printer-service';
import { RouteAccountService, type RouteAccountRow } from '@/collector/services/route-accounts';
import { useSession } from '@/shared/auth/auth-context';
import { Icon } from '@/shared/components/icon';
import { ListError } from '@/shared/components/list-states';
import { ScreenContainer, ScreenSection } from '@/shared/components/screen-container';
import { SkeletonList } from '@/shared/components/skeleton';
import { ReadingStateBadge } from '@/shared/components/status-badge';
import { TwdButton } from '@/shared/components/twd-button';
import { TwdTextField } from '@/shared/components/twd-text-field';
import { formatPeso } from '@/shared/format/currency';
import { useAsync } from '@/shared/hooks/use-async';
import { usePrint } from '@/shared/hooks/use-print';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { Radius, Spacing } from '@/shared/theme/twd';
import {
  billingPeriodFor,
  calculateBill,
  dueDateFor,
  invoiceNumberFor,
  type ReceiptInvoice,
} from '@/shared/utils/billing-calculator';

/**
 * Consumption above this is flagged, not blocked.
 *
 * A residential meter in Tanauan runs 30–60 m³ a month. 100+ is either a
 * mistyped digit — "12850" for "1285" bills ₱558,000 — or a genuine burst pipe,
 * and the app cannot tell which. Blocking would be wrong: the leak is real and the
 * bill is real. Staying silent would also be wrong: the collector is about to hand
 * over a receipt for money the consumer does not owe. So it says so, and lets the
 * person holding the meter decide.
 */
const IMPLAUSIBLE_CONSUMPTION = 100;

/**
 * Meter reading entry — the screen the whole module exists to serve.
 *
 * One input. Everything else on it is either context the collector needs to trust
 * the number (previous reading, billing period) or the consequence of it (the
 * live bill). The collector types four digits and hands over paper; that is the
 * entire job, and anything competing with the input is in the way.
 */
export default function MeterReadingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, reload } = useAsync(useCallback(() => RouteAccountService.get(id), [id]));

  return (
    <ScreenContainer variant="stack">
      {state.status === 'loading' && (
        <ScreenSection>
          <SkeletonList count={2} label="Loading account" />
        </ScreenSection>
      )}

      {state.status === 'error' && (
        <ScreenSection>
          <ListError
            title="Could not open this account"
            body="The account could not be read from this phone. Go back to your route and try again."
            onRetry={reload}
          />
        </ScreenSection>
      )}

      {state.status === 'ready' && !state.data && (
        <ScreenSection>
          <ListError
            title="Account not on your route"
            body="This account is not in the route saved on this phone."
          />
        </ScreenSection>
      )}

      {state.status === 'ready' && state.data && <ReadingForm account={state.data} />}
    </ScreenContainer>
  );
}

function ReadingForm({ account }: { account: RouteAccountRow }) {
  const router = useRouter();
  const theme = useTwdTheme();
  const { session } = useSession();
  const { print, printing, canPrint, printBlockedReason } = usePrint();

  // Prefilled when the meter has already been read today, so re-opening an account
  // is a correction rather than a blank slate the collector has to retype.
  const [input, setInput] = useState(
    account.currentReading !== undefined ? `${account.currentReading}` : ''
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const readingDate = new Date().toISOString().split('T')[0];

  const current = input.trim() === '' ? null : Number.parseInt(input, 10);
  const consumption = current === null ? null : current - account.previousReading;

  const error =
    current === null
      ? null
      : !Number.isFinite(current)
        ? 'Enter the reading as digits only.'
        : current < account.previousReading
          ? `Current reading cannot be less than the previous reading (${account.previousReading}). Check the digits on the meter.`
          : null;

  const valid = current !== null && !error && consumption !== null;
  const bill = useMemo(() => (valid ? calculateBill(consumption!) : null), [valid, consumption]);
  const implausible = valid && consumption! > IMPLAUSIBLE_CONSUMPTION;

  /**
   * Save first, print second — always, and never the other way round.
   *
   * The printer is the flaky part of this flow: BLE drops, the PT-210 runs out of
   * paper, its battery dies in a bag. If printing came first, every one of those
   * would cost the reading itself, and the collector would be standing at a meter
   * they have already read with nothing recorded. Saving first means the worst
   * printer failure costs a receipt, which can be reprinted, instead of a reading,
   * which cannot be re-taken once they have walked away.
   *
   * Returns the saved invoice so the caller can print it, or null if the save
   * failed — in which case nothing is printed, because a receipt for a record that
   * does not exist is the one outcome worse than no receipt.
   */
  const save = useCallback(async (): Promise<ReceiptInvoice | null> => {
    if (!valid || !bill) return null;

    setSaveError(null);
    setSaving(true);
    try {
      await OfflineStorage.saveMeterReading({
        id: newClientId('rdg'),
        routeId: session.user.routeIds?.[0] ?? 'UNASSIGNED',
        collectorId: session.user.id,
        accountNumber: account.accountNumber,
        previousReading: account.previousReading,
        currentReading: current!,
        consumption: consumption!,
        readingDate,
        timestamp: Date.now(),
        synced: false,
      });

      return {
        invoiceNo: invoiceNumberFor(account.accountNumber, readingDate),
        date: readingDate,
        dueDate: dueDateFor(readingDate),
        billingPeriod: billingPeriodFor(readingDate),
        previousReading: account.previousReading,
        currentReading: current!,
        consumption: consumption!,
        bill,
        collectorName: session.user.name,
        printedAt: Date.now(),
      };
    } catch {
      setSaveError(
        'Could not save this reading to the phone. Do not hand over a receipt — try again.'
      );
      return null;
    } finally {
      setSaving(false);
    }
  }, [valid, bill, session, account, current, consumption, readingDate]);

  const saveAndPrint = useCallback(async () => {
    const invoice = await save();
    if (!invoice) return;
    await print(() => PrinterService.printInvoice(invoice, account));
    router.back();
  }, [save, print, account, router]);

  const saveOnly = useCallback(async () => {
    const invoice = await save();
    if (!invoice) return;
    router.back();
  }, [save, router]);

  const busy = saving || printing;

  return (
    <>
      {/* The account number, not "Meter Reading" — a collector at a gate knows what
          screen they opened and needs to confirm which meter it is for. */}
      <Stack.Screen options={{ title: account.accountNumber }} />

      <ScreenSection gap={Spacing.two}>
        <View style={styles.titleRow}>
          <ThemedText type="defaultBold" style={styles.consumerName} numberOfLines={2}>
            {account.consumerName}
          </ThemedText>
          <ReadingStateBadge state={account.state} />
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {account.address}
        </ThemedText>
      </ScreenSection>

      <ScreenSection gap={Spacing.three}>
        <ThemedView type="backgroundElement" style={styles.card}>
          <ReadOnlyRow label="Previous reading" value={`${account.previousReading}`} />
          <ReadOnlyRow label="Billing period" value={billingPeriodFor(readingDate)} />
          <ReadOnlyRow label="Meter no." value={account.meterNumber} />
          <ReadOnlyRow label="Rate class" value={account.rateClass} />
        </ThemedView>
      </ScreenSection>

      <ScreenSection gap={Spacing.three}>
        <TwdTextField
          label="Current reading"
          placeholder={`${account.previousReading}`}
          value={input}
          // Digits only. The numeric keypad still offers a decimal separator on
          // some Android keyboards, and a meter does not have one.
          onChangeText={(text) => setInput(text.replace(/[^0-9]/g, ''))}
          keyboardType="number-pad"
          autoFocus
          returnKeyType="done"
          maxLength={7}
          error={error ?? undefined}
          hint={error ? undefined : 'Read the digits left to right off the meter face.'}
          inputStyle={styles.readingInput}
        />

        {implausible && (
          <View
            style={[styles.warning, { borderColor: theme.warning, backgroundColor: theme.warningSurface }]}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite">
            <Icon name="alert-triangle" size={18} color={theme.warning} />
            <ThemedText type="small" style={[styles.warningText, { color: theme.warning }]}>
              {consumption} m³ is far above a normal month. Check the digits before printing — if the
              meter really does read this, it is likely a leak worth reporting.
            </ThemedText>
          </View>
        )}
      </ScreenSection>

      {bill && (
        <ScreenSection gap={Spacing.three}>
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="defaultBold">This bill</ThemedText>
            <BillRow label="Consumption" value={`${consumption} m³`} />
            <BillRow label="Basic charge" value={formatPeso(bill.basicCharge)} />
            <BillRow label="VAT (12%)" value={formatPeso(bill.vat)} />

            <View style={[styles.totalRow, { borderTopColor: theme.border }]}>
              <ThemedText type="defaultBold">TOTAL DUE</ThemedText>
              <ThemedText
                style={[styles.total, { color: theme.primary }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}>
                {formatPeso(bill.totalAmountDue)}
              </ThemedText>
            </View>

            <ThemedText type="small" themeColor="textSecondary">
              Due {dueDateFor(readingDate)}. The printed receipt shows the full breakdown.
            </ThemedText>
          </ThemedView>
        </ScreenSection>
      )}

      {saveError && (
        <ScreenSection>
          <View
            style={[styles.warning, { borderColor: theme.danger, backgroundColor: theme.dangerSurface }]}
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive">
            <Icon name="alert-triangle" size={18} color={theme.danger} />
            <ThemedText type="small" style={[styles.warningText, { color: theme.danger }]}>
              {saveError}
            </ThemedText>
          </View>
        </ScreenSection>
      )}

      <ScreenSection gap={Spacing.three}>
        <TwdButton
          label="Save & Print Receipt"
          icon="printer"
          busy={busy}
          busyLabel={printing ? 'Printing…' : 'Saving…'}
          disabled={!valid || !canPrint || busy}
          onPress={() => void saveAndPrint()}
          accessibilityHint={
            printBlockedReason ?? 'Saves the reading on this phone and prints the receipt'
          }
        />

        {printBlockedReason && (
          <View style={styles.hint}>
            <Icon name="bluetooth" size={14} color={theme.textSecondary} />
            <ThemedText type="small" themeColor="textSecondary">
              {printBlockedReason} — connect it in More, or save without printing.
            </ThemedText>
          </View>
        )}

        <TwdButton
          label="Save Only"
          variant="secondary"
          disabled={!valid || busy}
          onPress={() => void saveOnly()}
          accessibilityHint="Saves the reading on this phone without printing a receipt"
        />
      </ScreenSection>
    </>
  );
}

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="small" style={styles.rowValue} numberOfLines={1}>
        {value}
      </ThemedText>
    </View>
  );
}

function BillRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="defaultBold">{value}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  consumerName: { flex: 1, fontSize: 20, lineHeight: 26 },
  card: {
    borderRadius: Radius.card,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.three,
  },
  rowValue: { flex: 1, textAlign: 'right' },
  // Big, because it is read back against a meter face at arm's length. fontSize
  // and lineHeight declared together — see the note on TwdTextField's inputStyle.
  readingInput: { fontSize: 32, lineHeight: 40, fontWeight: '700' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.three,
    borderTopWidth: 1,
    paddingTop: Spacing.two,
    marginTop: Spacing.one,
  },
  total: { flex: 1, textAlign: 'right', fontSize: 28, lineHeight: 34, fontWeight: '700' },
  warning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.card,
    borderWidth: 2,
  },
  warningText: { flex: 1 },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
  },
});
