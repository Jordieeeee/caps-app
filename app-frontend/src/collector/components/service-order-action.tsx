import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PrinterService } from '@/collector/services/printer-service';
import { ServiceOrderService, type ServiceOrderRow } from '@/collector/services/service-orders';
import { useSession } from '@/shared/auth/auth-context';
import { Icon } from '@/shared/components/icon';
import { ListError } from '@/shared/components/list-states';
import { ScreenContainer, ScreenSection } from '@/shared/components/screen-container';
import { SkeletonList } from '@/shared/components/skeleton';
import { SyncBadge } from '@/shared/components/status-badge';
import { TwdButton } from '@/shared/components/twd-button';
import { TwdTextField } from '@/shared/components/twd-text-field';
import { formatPeso } from '@/shared/format/currency';
import { useAsync } from '@/shared/hooks/use-async';
import { usePrint } from '@/shared/hooks/use-print';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { Radius, Spacing } from '@/shared/theme/twd';
import type { NoticeKind } from '@/shared/utils/billing-calculator';

const COPY = {
  reconnection: {
    title: 'Confirm reconnection',
    cta: 'Confirm service restored',
    ctaHint: 'Records the reconnection on this phone and prints the notice',
    balanceLabel: 'Settled',
    consequence: 'The consumer keeps this slip as proof their water was restored today.',
    doneHeadline: 'Service restored',
    notePlaceholder: 'Meter reading, condition of the service…',
  },
  disconnection: {
    title: 'Confirm disconnection',
    cta: 'Confirm service disconnected',
    ctaHint: 'Records the disconnection on this phone and prints the notice',
    balanceLabel: 'Outstanding',
    consequence:
      'The consumer keeps this slip. It tells them what they owe and that paying it restores service.',
    doneHeadline: 'Service disconnected',
    notePlaceholder: 'Meter locked, consumer notified, condition…',
  },
} as const;

/**
 * The confirmation screen for one service order.
 *
 * One tap is the whole action. Everything above the button is the collector
 * checking they are at the right gate, and the note underneath is optional.
 *
 * The note stayed optional rather than being dropped: the spec called for a bare
 * confirmation tap, and the flow this replaced *required* typed verification notes
 * on the grounds that they are what a later dispute turns on. Both are right about
 * something. Forcing a field worker to type a paragraph in the rain is how you get
 * "ok" typed into a legal record, which is evidence of nothing; but a
 * disconnection with no field account of what was found is a hard order to defend
 * three months later. So the tap is the primary action and unblocked, and the note
 * is there for the visit that warrants one.
 */
export function ServiceOrderAction({ kind }: { kind: NoticeKind }) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, reload } = useAsync(useCallback(() => ServiceOrderService.get(kind, id), [kind, id]));

  return (
    <ScreenContainer variant="stack">
      <Stack.Screen options={{ title: COPY[kind].title }} />

      {state.status === 'loading' && (
        <ScreenSection>
          <SkeletonList count={2} label="Loading order" />
        </ScreenSection>
      )}

      {state.status === 'error' && (
        <ScreenSection>
          <ListError
            title="Could not open this order"
            body="The order could not be read from this phone. Go back and try again."
            onRetry={reload}
          />
        </ScreenSection>
      )}

      {state.status === 'ready' && !state.data && (
        <ScreenSection>
          <ListError title="Order not found" body="This order is not on this phone." />
        </ScreenSection>
      )}

      {state.status === 'ready' && state.data && <ActionForm kind={kind} order={state.data} />}
    </ScreenContainer>
  );
}

function ActionForm({ kind, order }: { kind: NoticeKind; order: ServiceOrderRow }) {
  const router = useRouter();
  const theme = useTwdTheme();
  const { session } = useSession();
  const { print, printing, canPrint, printBlockedReason } = usePrint();
  const copy = COPY[kind];

  const [note, setNote] = useState(order.note ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const alreadyDone = order.state !== 'pending';
  const amount = order.settledAmount ?? order.outstandingBalance;

  const notice = useCallback(
    (confirmedAt: number) => ({
      kind,
      accountNumber: order.accountNumber,
      consumerName: order.consumerName,
      address: order.address,
      collectorName: session.user.name,
      confirmedAt,
      note: note.trim() || undefined,
    }),
    [kind, order, session, note]
  );

  /**
   * Record first, print second — the same rule as the meter reading, for the same
   * reason. A printer that fails after the work is recorded costs a slip that can
   * be reprinted from this screen; a printer that fails before it would cost the
   * record that the work happened at all.
   */
  const confirm = useCallback(async () => {
    setError(null);
    setSaving(true);
    try {
      const confirmedAt = await ServiceOrderService.confirm(order, note);
      await print(() => PrinterService.printServiceNotice(notice(confirmedAt)));
      router.back();
    } catch {
      setError('Could not save this order to the phone. Try again before leaving the site.');
    } finally {
      setSaving(false);
    }
  }, [order, note, print, notice, router]);

  const reprint = useCallback(async () => {
    await print(() => PrinterService.printServiceNotice(notice(order.confirmedAt ?? Date.now())));
  }, [print, notice, order.confirmedAt]);

  const busy = saving || printing;

  return (
    <>
      <ScreenSection gap={Spacing.two}>
        <View style={styles.titleRow}>
          <ThemedText type="defaultBold" style={styles.consumerName} numberOfLines={2}>
            {order.consumerName}
          </ThemedText>
          {alreadyDone && <SyncBadge status={order.state === 'done' ? 'synced' : 'pending'} />}
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {order.address}
        </ThemedText>
      </ScreenSection>

      <ScreenSection gap={Spacing.three}>
        <ThemedView type="backgroundElement" style={styles.card}>
          <Row label="Account no." value={order.accountNumber} />
          <Row label="Order ref." value={order.id} />
          <Row label={copy.balanceLabel} value={formatPeso(amount)} />
          {order.settledDate && <Row label="Settled on" value={order.settledDate} />}
          <Row label="Reason" value={order.reason} />
        </ThemedView>
      </ScreenSection>

      {alreadyDone ? (
        <ScreenSection gap={Spacing.three}>
          <View
            style={[styles.done, { borderColor: theme.success, backgroundColor: theme.backgroundElement }]}
            accessible
            accessibilityRole="summary">
            <Icon name="check" size={22} color={theme.success} />
            <View style={styles.doneText}>
              <ThemedText type="defaultBold" style={{ color: theme.success }}>
                {copy.doneHeadline}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {order.confirmedAt
                  ? `Confirmed ${new Date(order.confirmedAt).toLocaleString()}.`
                  : 'Confirmed on this phone.'}
                {order.state === 'pending-sync' ? ' Not yet sent to TWD.' : ''}
              </ThemedText>
            </View>
          </View>

          {order.note ? (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="small" themeColor="textSecondary">
                Field note
              </ThemedText>
              <ThemedText type="small">{order.note}</ThemedText>
            </ThemedView>
          ) : null}

          <TwdButton
            label="Print notice again"
            icon="printer"
            variant="secondary"
            busy={printing}
            busyLabel="Printing…"
            disabled={!canPrint || busy}
            onPress={() => void reprint()}
            accessibilityHint={printBlockedReason ?? 'Reprints the notice for this order'}
          />
          {printBlockedReason && <Hint text={printBlockedReason} />}
        </ScreenSection>
      ) : (
        <>
          <ScreenSection gap={Spacing.three}>
            <TwdTextField
              label="Field note (optional)"
              placeholder={copy.notePlaceholder}
              value={note}
              onChangeText={setNote}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              inputStyle={styles.noteInput}
              hint="Only if there is something worth recording. The confirmation below does not need it."
            />
          </ScreenSection>

          {error && (
            <ScreenSection>
              <View
                style={[styles.warning, { borderColor: theme.danger, backgroundColor: theme.dangerSurface }]}
                accessibilityRole="alert"
                accessibilityLiveRegion="assertive">
                <Icon name="alert-triangle" size={18} color={theme.danger} />
                <ThemedText type="small" style={[styles.warningText, { color: theme.danger }]}>
                  {error}
                </ThemedText>
              </View>
            </ScreenSection>
          )}

          <ScreenSection gap={Spacing.three}>
            <ThemedText type="small" themeColor="textSecondary">
              {copy.consequence}
            </ThemedText>
            <TwdButton
              label={copy.cta}
              icon="check"
              busy={busy}
              busyLabel={printing ? 'Printing…' : 'Saving…'}
              disabled={busy}
              onPress={() => void confirm()}
              accessibilityHint={copy.ctaHint}
            />
            {printBlockedReason && (
              <Hint text={`${printBlockedReason} — the confirmation is still recorded without it.`} />
            )}
          </ScreenSection>
        </>
      )}
    </>
  );
}

function Hint({ text }: { text: string }) {
  const theme = useTwdTheme();
  return (
    <View style={styles.hint}>
      <Icon name="bluetooth" size={14} color={theme.textSecondary} />
      <ThemedText type="small" themeColor="textSecondary">
        {text}
      </ThemedText>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="small" style={styles.rowValue}>
        {value}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  consumerName: { flex: 1, fontSize: 20, lineHeight: 26 },
  card: { borderRadius: Radius.card, padding: Spacing.four, gap: Spacing.two },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  rowValue: { flex: 1, textAlign: 'right' },
  noteInput: { minHeight: 72 },
  done: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.card,
    borderWidth: 2,
  },
  doneText: { flex: 1, gap: Spacing.half },
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
