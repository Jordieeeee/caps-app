import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import {
  listAccounts,
  listBills,
  listNotices,
  type Bill,
  type Notice,
} from '@/consumer/services/consumer-data';
import { dueLabel, summarise, type Urgency } from '@/consumer/lib/bill-summary';
import { useSession } from '@/shared/auth/auth-context';
import { Icon } from '@/shared/components/icon';
import { ListEmpty, ListError, ListLoading } from '@/shared/components/list-states';
import { ScreenContainer, ScreenSection } from '@/shared/components/screen-container';
import { ScreenHeader } from '@/shared/components/screen-header';
import { NoticeBadge, noticeTone, useToneColor } from '@/shared/components/status-badge';
import { TwdButton } from '@/shared/components/twd-button';
import { formatPeso } from '@/shared/format/currency';
import { useAsync } from '@/shared/hooks/use-async';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { Radius, Spacing } from '@/shared/theme/twd';

/**
 * Home — one question, answered before anything else: what do I owe, and when is
 * it due?
 *
 * The old Home answered none of that. It showed a greeting, a card listing bare
 * account numbers with no balance or status beside them, and a Sign Out button —
 * the only interactive thing on the consumer's landing screen was the way out of
 * it. A consumer opening a water utility app is asking about money and dates, and
 * had to go find both.
 *
 * Sign Out moved to Account, where a destructive session action belongs and where
 * it now asks first.
 */
export default function ConsumerHome() {
  const { session } = useSession();
  const router = useRouter();

  const load = useCallback(
    async () =>
      Promise.all([listBills(), listAccounts(), listNotices()]).then(
        ([bills, accounts, notices]) => ({ bills, accounts, notices })
      ),
    []
  );
  const { state, reload } = useAsync(load);

  return (
    <ScreenContainer>
      <ScreenHeader title={firstName(session.user.name)} subtitle={greeting()} />

      {state.status === 'loading' && (
        <ScreenSection>
          <ListLoading label="Checking your bills…" />
        </ScreenSection>
      )}

      {state.status === 'error' && (
        <ScreenSection>
          <ListError
            title="Could not load your bills"
            body="We couldn't reach Tanauan City Water District just now. Check your connection and try again."
            onRetry={reload}
          />
        </ScreenSection>
      )}

      {state.status === 'ready' && state.data.accounts.length === 0 && (
        // The state every consumer starts in. It is the whole screen, because
        // there is genuinely nothing else true to show — and it names the one
        // action that makes the rest of the app work.
        <ScreenSection>
          <ListEmpty
            icon="home"
            title="Link your water account"
            body="Enter the account number on your TWD bill to see what you owe, when it's due, and your payment history."
            action={{ label: 'Link an account', onPress: () => router.push('/consumer/account') }}
          />
        </ScreenSection>
      )}

      {state.status === 'ready' && state.data.accounts.length > 0 && (
        <>
          <ScreenSection>
            <BillSummaryCard bills={state.data.bills} />
          </ScreenSection>

          <ScreenSection gap={Spacing.two}>
            <TwdButton
              label="View my bills"
              icon="file-text"
              onPress={() => router.push('/consumer/bills')}
              accessibilityHint="Opens your current bill and payment history"
            />
            <TwdButton
              label="How to pay"
              icon="wallet"
              variant="secondary"
              onPress={() => router.push('/consumer/bills/how-to-pay')}
              accessibilityHint="Shows where and how to pay your TWD bill"
            />
          </ScreenSection>

          {/* Only notices that could change the consumer's day. A routine update
              about office hours does not belong on a screen about money — it is a
              tap away in Notices, and putting it here would train people to skip
              this block on the day it says the main is out. */}
          <RecentNotices notices={state.data.notices.filter((n) => n.priority !== 'low')} />
        </>
      )}
    </ScreenContainer>
  );
}

/**
 * The hero. Total outstanding, when the soonest is due, and how bad that is.
 *
 * Tone is earned by the data, not decoration: a bill 3 days late and a bill due
 * next month are not the same news, and a consumer must not have to read a date
 * and do the arithmetic to find out which one they are looking at.
 */
function BillSummaryCard({ bills }: { bills: Bill[] }) {
  const theme = useTwdTheme();
  const router = useRouter();
  const { outstanding, totalDue, next, daysUntilDue, urgency } = summarise(bills);

  const accent = urgencyColor(urgency, theme);

  if (!next) {
    return (
      <View style={[styles.summaryCard, { borderColor: theme.success, backgroundColor: theme.backgroundElement }]}>
        <View style={styles.summaryTop}>
          <Icon name="check" size={22} color={theme.success} />
          <ThemedText type="defaultBold" style={{ color: theme.success }}>
            Nothing due
          </ThemedText>
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          All your accounts are paid up. We&apos;ll show your next bill here when it&apos;s issued.
        </ThemedText>
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => router.push('/consumer/bills')}
      accessibilityRole="button"
      accessibilityLabel={`Total due ${formatPeso(totalDue)}. ${dueLabel(daysUntilDue)}. Opens your bills.`}
      style={({ pressed }) => [
        styles.summaryCard,
        {
          borderColor: accent,
          backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
        },
      ]}>
      <View style={styles.summaryTop}>
        <ThemedText type="small" themeColor="textSecondary">
          {outstanding.length === 1 ? 'Total due' : `Total due · ${outstanding.length} bills`}
        </ThemedText>
        {/* Icon + words, never colour alone — an overdue bill has to read as
            overdue in greyscale and in direct sun. */}
        <View style={styles.dueRow}>
          <Icon
            name={urgency === 'overdue' ? 'alert-triangle' : 'calendar'}
            size={16}
            color={accent}
          />
          <ThemedText type="smallBold" style={{ color: accent }}>
            {dueLabel(daysUntilDue)}
          </ThemedText>
        </View>
      </View>

      <ThemedText
        style={styles.summaryAmount}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}>
        {formatPeso(totalDue)}
      </ThemedText>

      <ThemedText type="small" themeColor="textSecondary">
        {next.billingPeriod} · {next.accountNumber} · due {next.dueDate}
      </ThemedText>

      {urgency === 'overdue' && (
        <View style={[styles.overdueNote, { borderColor: theme.danger, backgroundColor: theme.dangerSurface }]}>
          <ThemedText type="small" style={{ color: theme.danger }}>
            Pay as soon as you can. Unpaid accounts may be scheduled for disconnection.
          </ThemedText>
        </View>
      )}
    </Pressable>
  );
}

function RecentNotices({ notices }: { notices: Notice[] }) {
  const router = useRouter();
  if (notices.length === 0) return null;

  return (
    <ScreenSection gap={Spacing.two}>
      <ThemedText type="defaultBold">Notices for you</ThemedText>
      {notices.slice(0, 2).map((notice) => (
        <NoticeRow key={notice.id} notice={notice} onPress={() => router.push('/consumer/notices')} />
      ))}
    </ScreenSection>
  );
}

function NoticeRow({ notice, onPress }: { notice: Notice; onPress: () => void }) {
  const theme = useTwdTheme();
  const accent = useToneColor(noticeTone(notice.priority));

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${notice.title}. Opens notices.`}
      style={({ pressed }) => [
        styles.noticeRow,
        {
          borderColor: accent,
          backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
        },
      ]}>
      <View style={styles.noticeText}>
        <NoticeBadge type={notice.type} priority={notice.priority} />
        <ThemedText type="defaultBold" numberOfLines={2}>
          {notice.title}
        </ThemedText>
      </View>
      <Icon name="chevron-right" size={20} color={theme.textSecondary} />
    </Pressable>
  );
}

function urgencyColor(urgency: Urgency, theme: ReturnType<typeof useTwdTheme>): string {
  switch (urgency) {
    case 'overdue':
      return theme.danger;
    case 'due-soon':
      return theme.warning;
    case 'scheduled':
      return theme.primary;
    case 'clear':
      return theme.success;
  }
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

const styles = StyleSheet.create({
  summaryCard: {
    padding: Spacing.four,
    borderRadius: Radius.card,
    borderWidth: 2,
    gap: Spacing.two,
  },
  summaryTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  dueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  // fontSize with its own lineHeight. Inheriting `title`'s 52px box onto a
  // smaller glyph is what wrapped the collector's currency tiles into overlapping
  // lines; money gets its metrics declared together everywhere now.
  summaryAmount: {
    fontSize: 40,
    lineHeight: 46,
    fontWeight: '700',
  },
  overdueNote: {
    padding: Spacing.three,
    borderRadius: Radius.field,
    borderWidth: 2,
    marginTop: Spacing.one,
  },
  noticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.card,
    borderWidth: 2,
  },
  noticeText: { flex: 1, gap: Spacing.two, alignItems: 'flex-start' },
});
