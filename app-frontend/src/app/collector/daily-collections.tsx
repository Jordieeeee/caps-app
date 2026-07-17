import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { OfflineStorage } from '@/collector/services/offline-storage';
import { RouteAccountService } from '@/collector/services/route-accounts';
import { SyncService } from '@/collector/services/sync-service';
import { useSession } from '@/shared/auth/auth-context';
import { Icon } from '@/shared/components/icon';
import { ListEmpty, ListError } from '@/shared/components/list-states';
import { ScreenContainer, ScreenSection } from '@/shared/components/screen-container';
import { ScreenHeader } from '@/shared/components/screen-header';
import { SkeletonList } from '@/shared/components/skeleton';
import { SyncBadge } from '@/shared/components/status-badge';
import { TwdButton } from '@/shared/components/twd-button';
import { formatPeso } from '@/shared/format/currency';
import { useAsync } from '@/shared/hooks/use-async';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { MIN_TAP_TARGET, Radius, Spacing } from '@/shared/theme/twd';
import { calculateBill } from '@/shared/utils/billing-calculator';

/**
 * Daily Summary — what this collector has read today, and getting it to the office.
 *
 * This screen used to be "Daily Collections": an Add Collection form with a cash
 * amount, a payment method picker (Cash/Check/Electronic) and a Daily Report
 * print button, filtered by a Select Collector chip row. Every part of that was
 * modelling a job nobody does — TWD's collectors do not handle money, there is one
 * collector per phone, and the office wants finished invoices rather than a cash
 * tally. The screen now answers the two questions the shift actually ends on: how
 * much of my route did I read, and has the office got it.
 *
 * Rows come from the real reading outbox, not from a mock list. A summary screen
 * that invents its own readings would show twelve rows that have nothing to do
 * with the meters this collector walked, and the Submit button under them would
 * send something else entirely. The names and account numbers are the route's (see
 * route-accounts), so they are Filipino names against WD-XXXXX accounts as
 * specified — they just arrive by being read rather than by being hardcoded here.
 */

interface ReadingRow {
  /** The record's clientId — the sync key, and what a retry is scoped to. */
  id: string;
  accountNumber: string;
  consumerName: string;
  consumption: number;
  amountDue: number;
  synced: boolean;
  timestamp: number;
}

interface DailySummary {
  rows: ReadingRow[];
  accountsRead: number;
  totalOnRoute: number;
}

async function loadDailySummary(): Promise<DailySummary> {
  const [accounts, readings] = await Promise.all([
    RouteAccountService.getCached(),
    OfflineStorage.getMeterReadings(),
  ]);

  const today = new Date().toISOString().split('T')[0];
  const nameFor = new Map(accounts.map((a) => [a.accountNumber, a.consumerName]));
  const todays = readings.filter((r) => r.readingDate === today);

  const rows: ReadingRow[] = todays
    .map((r) => ({
      id: r.id,
      accountNumber: r.accountNumber,
      // Falls back to the account number rather than "Unknown": a reading can
      // outlive its route cache, and the number is still the thing the office
      // looks the consumer up by.
      consumerName: nameFor.get(r.accountNumber) ?? r.accountNumber,
      consumption: r.consumption,
      amountDue: calculateBill(r.consumption).totalAmountDue,
      synced: r.synced,
      timestamp: r.timestamp,
    }))
    // Most recent first — the collector is checking the meter they just left.
    .sort((a, b) => b.timestamp - a.timestamp);

  return {
    rows,
    // Distinct accounts, not rows: re-reading a meter to correct it writes a second
    // record, and it would be wrong to tell someone they have read 15 of 12
    // accounts.
    accountsRead: new Set(todays.map((r) => r.accountNumber)).size,
    totalOnRoute: accounts.length,
  };
}

type Notice = { tone: 'success' | 'danger'; text: string };

export default function DailySummaryScreen() {
  const { sync } = useSession();
  const theme = useTwdTheme();

  const { state, reload } = useAsync(useCallback(() => loadDailySummary(), []));
  const [submitting, setSubmitting] = useState(false);
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<Notice | null>(null);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  const summary = useMemo(
    () => (state.status === 'ready' ? state.data : null),
    [state]
  );

  // Memoised for a stable identity — `submit` closes over it, and a fresh [] every
  // render would rebuild the callback on every render.
  const rows = useMemo(() => summary?.rows ?? [], [summary]);
  const pending = rows.filter((r) => !r.synced);
  const failedCount = rows.filter((r) => !r.synced && failedIds.has(r.id)).length;

  const online = sync === 'online';
  const canSubmit = pending.length > 0 && online && !submitting;

  const disabledReason =
    pending.length === 0
      ? 'No pending records'
      : !online
        ? 'No connection'
        : null;

  /**
   * Send the outbox, then work out what did not make it.
   *
   * `SyncService` reports totals — `{ success, failed }` — and never says which
   * records failed, so a per-row Failed chip cannot be read off the result. It can
   * be derived: note which records were unsent before the attempt, and ask again
   * afterwards. Anything still unsent that we just tried to send is a record that
   * failed, and everything else is untouched. That keeps the whole thing inside
   * this screen rather than growing a per-record error column in storage that every
   * other screen would then have to interpret.
   *
   * The failed set is deliberately not persisted — see the `failed` descriptor in
   * status-badge for why a red chip cannot survive a restart honestly.
   */
  const submit = useCallback(async () => {
    const attempted = rows.filter((r) => !r.synced).map((r) => r.id);
    if (!attempted.length) return;

    setSubmitting(true);
    setNotice(null);

    try {
      await SyncService.forceSyncNow();
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      setNotice({
        tone: 'danger',
        text: message.includes('already in progress')
          ? // Not a failure: the 30s background sync in the collector shell got there
            // first, and these records are on their way. Saying "could not submit"
            // here would send someone chasing a problem that is resolving itself.
            'Already sending in the background. This will finish on its own — check back in a moment.'
          : 'Could not reach TWD. Your readings are still saved on this phone. Try again when you have signal.',
      });
      setSubmitting(false);
      return;
    }

    const stillUnsent = new Set(
      (await OfflineStorage.getUnsyncedMeterReadings()).map((r) => r.id)
    );
    const failed = attempted.filter((id) => stillUnsent.has(id));
    const sent = attempted.length - failed.length;

    setFailedIds(new Set(failed));
    setNotice(
      failed.length === 0
        ? {
            tone: 'success',
            text:
              sent === 1
                ? '1 reading sent to TWD.'
                : `${sent} readings sent to TWD.`,
          }
        : {
            tone: 'danger',
            text:
              sent > 0
                ? `${sent} sent, ${failed.length} did not go through. The ones that failed are still saved on this phone.`
                : `${failed.length} did not go through. They are still saved on this phone.`,
          }
    );

    reload();
    setSubmitting(false);
  }, [rows, reload]);

  return (
    <ScreenContainer onRefresh={reload} refreshing={false}>
      <ScreenHeader title="Daily Summary" subtitle="Today's meter readings" />

      <ScreenSection gap={Spacing.three}>
        <View style={styles.cardRow}>
          <SummaryCard
            label="Accounts read"
            value={summary ? `${summary.accountsRead}` : '—'}
            caption={summary ? `of ${summary.totalOnRoute} on route` : undefined}
          />
          <SummaryCard
            label="Pending sync"
            value={summary ? `${pending.length}` : '—'}
            tone={pending.length > 0 ? theme.warning : undefined}
            caption={pending.length > 0 ? 'not sent yet' : 'all sent'}
          />
        </View>

        {summary && summary.totalOnRoute > 0 && (
          <RouteProgress read={summary.accountsRead} total={summary.totalOnRoute} />
        )}
      </ScreenSection>

      {notice && (
        <ScreenSection>
          <View
            style={[
              styles.notice,
              {
                borderColor: notice.tone === 'success' ? theme.success : theme.danger,
                backgroundColor:
                  notice.tone === 'success' ? theme.backgroundElement : theme.dangerSurface,
              },
            ]}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite">
            <Icon
              name={notice.tone === 'success' ? 'check' : 'alert-triangle'}
              size={20}
              color={notice.tone === 'success' ? theme.success : theme.danger}
            />
            <ThemedText
              type="small"
              style={[
                styles.noticeText,
                { color: notice.tone === 'success' ? theme.success : theme.danger },
              ]}>
              {notice.text}
            </ThemedText>
          </View>
        </ScreenSection>
      )}

      <ScreenSection gap={Spacing.three}>
        {state.status === 'loading' && <SkeletonList count={3} label="Loading today's readings" />}

        {state.status === 'error' && (
          <ListError
            title="Could not load today's readings"
            body="The readings saved on this phone could not be read. They have not been lost — try again."
            onRetry={reload}
          />
        )}

        {state.status === 'ready' && rows.length === 0 && (
          <ListEmpty
            icon="gauge"
            title="No readings yet today"
            body="Complete meter readings on your route to see them here."
          />
        )}

        {rows.map((row) => (
          <ReadingCard
            key={row.id}
            row={row}
            failed={!row.synced && failedIds.has(row.id)}
            busy={submitting}
            onRetry={() => void submit()}
          />
        ))}

        {failedCount > 0 && (
          <Pressable
            onPress={() => void submit()}
            disabled={submitting || !online}
            accessibilityRole="button"
            accessibilityLabel={`Retry ${failedCount} failed ${failedCount === 1 ? 'reading' : 'readings'}`}
            style={styles.retryAll}>
            <Icon name="refresh" size={16} color={theme.danger} />
            <ThemedText type="smallBold" style={{ color: theme.danger }}>
              Retry failed ({failedCount})
            </ThemedText>
          </Pressable>
        )}
      </ScreenSection>

      <ScreenSection gap={Spacing.two}>
        <TwdButton
          label="Submit to Admin"
          icon="refresh"
          busy={submitting}
          busyLabel="Submitting…"
          disabled={!canSubmit}
          onPress={() => void submit()}
          accessibilityHint={
            disabledReason ??
            'Sends today’s readings and their calculated invoices to the TWD office'
          }
        />
        {disabledReason && (
          <View style={styles.hint}>
            <Icon
              name={disabledReason === 'No connection' ? 'cloud-off' : 'check'}
              size={14}
              color={theme.textSecondary}
            />
            <ThemedText type="small" themeColor="textSecondary">
              {disabledReason === 'No connection'
                ? 'No connection — your readings are safe on this phone and will send themselves when you get signal.'
                : 'No pending records — everything read today is already with TWD.'}
            </ThemedText>
          </View>
        )}
      </ScreenSection>
    </ScreenContainer>
  );
}

function SummaryCard({
  label,
  value,
  caption,
  tone,
}: {
  label: string;
  value: string;
  caption?: string;
  tone?: string;
}) {
  return (
    <ThemedView type="backgroundElement" style={styles.summaryCard}>
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
        {label}
      </ThemedText>
      <ThemedText style={[styles.summaryValue, tone ? { color: tone } : null]} numberOfLines={1}>
        {value}
      </ThemedText>
      {caption && (
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {caption}
        </ThemedText>
      )}
    </ThemedView>
  );
}

/**
 * Route completion, as a bar.
 *
 * Announced as a progressbar with a text value, because the bar itself is colour
 * and geometry — neither of which a screen reader can read, and neither of which
 * survives direct sunlight especially well. The sentence under it is the real
 * answer; the bar is the glance.
 */
function RouteProgress({ read, total }: { read: number; total: number }) {
  const theme = useTwdTheme();
  const ratio = total > 0 ? Math.min(read / total, 1) : 0;
  const complete = read >= total && total > 0;

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: total, now: read }}
      accessibilityLabel={`${read} of ${total} accounts read today`}
      style={styles.progressWrap}>
      <View style={[styles.progressTrack, { backgroundColor: theme.backgroundSelected }]}>
        <View
          style={[
            styles.progressFill,
            {
              width: `${ratio * 100}%`,
              backgroundColor: complete ? theme.success : theme.primary,
            },
          ]}
        />
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {read} of {total} accounts read today
      </ThemedText>
    </View>
  );
}

function ReadingCard({
  row,
  failed,
  busy,
  onRetry,
}: {
  row: ReadingRow;
  failed: boolean;
  busy: boolean;
  onRetry: () => void;
}) {
  const theme = useTwdTheme();

  return (
    <ThemedView
      type="backgroundElement"
      style={[styles.readingCard, failed ? { borderColor: theme.danger, borderWidth: 2 } : null]}>
      <View style={styles.readingHeader}>
        <View style={styles.readingHeaderText}>
          <ThemedText type="defaultBold" numberOfLines={1}>
            {row.accountNumber}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {row.consumerName}
          </ThemedText>
        </View>
        <SyncBadge status={row.synced ? 'synced' : failed ? 'failed' : 'pending'} />
      </View>

      <View style={[styles.readingFooter, { borderTopColor: theme.border }]}>
        <View style={styles.readingItem}>
          <ThemedText type="small" themeColor="textSecondary">
            Consumption
          </ThemedText>
          <ThemedText type="defaultBold">{row.consumption} m³</ThemedText>
        </View>
        <View style={styles.readingItem}>
          <ThemedText type="small" themeColor="textSecondary">
            Amount due
          </ThemedText>
          <ThemedText type="defaultBold" numberOfLines={1}>
            {formatPeso(row.amountDue)}
          </ThemedText>
        </View>

        {failed && (
          <Pressable
            onPress={onRetry}
            disabled={busy}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={`Retry sending the reading for ${row.accountNumber}`}
            style={({ pressed }) => [
              styles.retryIcon,
              {
                borderColor: theme.danger,
                backgroundColor: pressed ? theme.dangerSurface : 'transparent',
                opacity: busy ? 0.5 : 1,
              },
            ]}>
            <Icon name="refresh" size={18} color={theme.danger} />
          </Pressable>
        )}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  cardRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  summaryCard: {
    flex: 1,
    borderRadius: Radius.card,
    padding: Spacing.three,
    gap: Spacing.one,
    alignItems: 'center',
  },
  // fontSize with its own lineHeight — these previously inherited `title`'s 52px
  // line box onto a 20px glyph and collided when they wrapped.
  summaryValue: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
  },
  progressWrap: { gap: Spacing.two },
  progressTrack: {
    height: 10,
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: Radius.pill,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.card,
    borderWidth: 2,
  },
  noticeText: { flex: 1 },
  readingCard: {
    borderRadius: Radius.card,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  readingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  readingHeaderText: { flex: 1 },
  readingFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
    borderTopWidth: 1,
    paddingTop: Spacing.two,
  },
  readingItem: { gap: Spacing.half },
  retryIcon: {
    marginLeft: 'auto',
    width: MIN_TAP_TARGET,
    height: MIN_TAP_TARGET,
    borderRadius: Radius.field,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    minHeight: MIN_TAP_TARGET,
  },
  hint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.one,
  },
});
