import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import {
  getProfile,
  listAccounts,
  listBills,
  listNotices,
  type Account,
  type Bill,
  type ConsumerProfile,
  type Notice,
} from '@/consumer/services/consumer-data';
import { accountChipsFor } from '@/consumer/lib/account-label';
import { dueLabel, summarise, type Urgency } from '@/consumer/lib/bill-summary';
import { recentUsage } from '@/consumer/lib/usage-summary';
import { BillCalendarButton } from '@/consumer/components/bill-calendar';
import { WaterUsageSummary } from '@/consumer/components/water-usage';
import { useIdentity } from '@/shared/auth/auth-context';
import { FilterChips } from '@/shared/components/filter-chips';
import { Icon } from '@/shared/components/icon';
import { ListEmpty, ListError } from '@/shared/components/list-states';
import { SkeletonList } from '@/shared/components/skeleton';
import { ScreenContainer, ScreenSection } from '@/shared/components/screen-container';
import { ScreenHeader } from '@/shared/components/screen-header';
import { NoticeBadge, noticeTone, useToneColor } from '@/shared/components/status-badge';
import { TwdButton } from '@/shared/components/twd-button';
import { formatPeso } from '@/shared/format/currency';
import { formatBillingPeriod, formatDate } from '@/shared/format/date';
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
  // useIdentity, not useSession: this screen is reachable by BOTH a password
  // consumer and a Google-claimed one, and useSession throws for the latter —
  // which crashed the whole navigator in a render loop. It supplies the
  // fallback only; the greeting proper comes from the registry profile below.
  const { name, email } = useIdentity();
  const router = useRouter();

  const load = useCallback(
    async () =>
      // getProfile is allSettled-style on purpose: it carries the greeting, not
      // the answer this screen exists to give. A consumer whose profile call
      // fails should still see what they owe, greeted a little less warmly —
      // failing the whole load over a display name would be the wrong trade.
      Promise.all([
        listBills(),
        listAccounts(),
        listNotices(),
        getProfile().catch(() => null),
      ]).then(([bills, accounts, notices, profile]) => ({
        bills,
        accounts,
        notices,
        profile,
      })),
    []
  );
  const { state, reload, refresh, refreshing } = useAsync(load);

  /**
   * Which account Home is answering for. Null means "all of them".
   *
   * Home exists to answer one question — what do I owe and when — and a
   * consumer with two properties has two answers to it. Merging them is still
   * the default, because "what do I owe TWD in total" is the question someone
   * about to pay is asking. The filter is how they get the other answer without
   * leaving the screen.
   */
  const [accountFilter, setAccountFilter] = useState<string | null>(null);

  return (
    <ScreenContainer onRefresh={() => void refresh()} refreshing={refreshing}>
      {/* The REGISTRY given name, taken from the portal's own `firstName`
          field rather than sliced out of the full name. Filipino given names
          are frequently compound — this household's is literally "Mark
          Jordan" — so splitting "Mark Jordan Berber Javier" on whitespace
          greets them as "Mark", which is a different person's name. The portal
          already stores the parts separately; there is nothing to infer.

          The Google session carries no display name at all (the callback
          returns only { sessionToken, role, email }), hence the fallback chain
          down to the email, so the header is never blank while the profile is
          still in flight. */}
      <ScreenHeader
        title={greetingName(
          state.status === 'ready' ? state.data.profile : null,
          name,
          email
        )}
        subtitle={greeting()}
        /* Top-right, on the title's own row, so it costs no vertical space.
           Rendered whatever the load state: the date is true before the bills
           arrive, and a header control that appears late makes the screen jump
           under the reader. With no bills the calendar simply has no dots. */
        action={
          <BillCalendarButton
            bills={state.status === 'ready' ? billsFor(state.data.bills, accountFilter) : []}
          />
        }
      />

      {state.status === 'loading' && (
        <ScreenSection>
          <SkeletonList count={2} label="Checking your bills" />
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
          <HomeAccountFilter
            bills={state.data.bills}
            accounts={state.data.accounts}
            selected={accountFilter}
            onSelect={setAccountFilter}
          />

          <ScreenSection>
            <BillSummaryCard bills={billsFor(state.data.bills, accountFilter)} />
          </ScreenSection>

          {/* Second, never first. Home answers "what do I owe and when" before
              anything else; usage is the follow-up question — and on a month with
              a big bill, it is the one that explains the first answer. Rendered
              only when a bill actually carries a reading, so it cannot become an
              empty box promising data the district has not sent. */}
          <UsageSummary bills={billsFor(state.data.bills, accountFilter)} />

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

  /**
   * How many water accounts the unpaid bills span.
   *
   * The total below merges every account the consumer holds, which is the right
   * answer to "what do I owe TWD" and a dangerous one to leave unlabelled: a
   * consumer with two houses reading a single ₱2,144 can pay one property's
   * bill believing both are settled. Naming the span is the cheapest honest
   * fix — the per-account figures live one tap away on the Account tab, which
   * now knows each balance separately.
   */
  const accountsDue = new Set(outstanding.map((b) => b.accountNumber).filter(Boolean)).size;

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
      accessibilityLabel={`Total due ${formatPeso(totalDue)}${
        accountsDue > 1 ? ` across ${accountsDue} accounts` : ''
      }. ${dueLabel(daysUntilDue)}. Opens your bills.`}
      style={({ pressed }) => [
        styles.summaryCard,
        {
          borderColor: accent,
          backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
        },
      ]}>
      <View style={styles.summaryTop}>
        <ThemedText type="small" themeColor="textSecondary">
          {outstanding.length === 1
            ? 'Total due'
            : accountsDue > 1
              ? `Total due · ${outstanding.length} bills · ${accountsDue} accounts`
              : `Total due · ${outstanding.length} bills`}
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
        {/* The account number is here again, and only when it disambiguates.
            It was dropped when real bills genuinely carried no account
            reference; billingController resolves one from connectionId now.
            This line names the SOONEST unpaid bill, so with two houses it is
            the difference between "pay this" and "pay this, for that house". */}
        {accountsDue > 1 && next.accountNumber ? `${next.accountNumber} · ` : ''}
        {formatBillingPeriod(next.billingPeriod)} · due {formatDate(next.dueDate)}
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

/** Bills for the chosen account, or all of them when nothing is chosen. */
function billsFor(bills: Bill[], accountNumber: string | null): Bill[] {
  return accountNumber ? bills.filter((b) => b.accountNumber === accountNumber) : bills;
}

/**
 * The account chooser, drawn only when there is a choice.
 *
 * One account means one chip — a control that cannot change anything — so it is
 * not rendered at all and Home is exactly the screen it was before this
 * existed. Same rule as the Bills filter, and the same labels: properties are
 * named by place, because ACC-2026-0007 and ACC-2026-0008 differ by one
 * character in the middle of sixteen.
 *
 * Both cards below it narrow together. A filter that scoped the money but left
 * "Past 3 months used" summing two houses would be worse than no filter: the
 * two figures would look like they belonged to the same meter.
 */
function HomeAccountFilter({
  bills,
  accounts,
  selected,
  onSelect,
}: {
  bills: Bill[];
  accounts: Account[];
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const chips = accountChipsFor(bills, accounts);
  if (chips.length < 2) return null;

  return (
    <ScreenSection>
      <FilterChips
        chips={chips}
        selectedId={selected}
        onSelect={onSelect}
        allLabel="All accounts"
        allCount={bills.length}
        accessibilityLabel="Show what you owe for one water account, or all of them"
      />
    </ScreenSection>
  );
}

/**
 * Water used, past 3 months — the same derivation Bills uses, at Home's density.
 *
 * Returns nothing rather than an empty-state card when no recent bill carries a
 * reading. A section headed "Past 3 months used" over "no data yet" takes up the
 * same room as the answer and gives the consumer a worse one; Bills is where the
 * per-bill "Not recorded" belongs, next to the bill it is about.
 */
function UsageSummary({ bills }: { bills: Bill[] }) {
  const usage = recentUsage(bills);
  if (!usage) return null;

  // recentUsage sums each month across every account the consumer holds, so a
  // two-house total is not a figure anyone can check against one meter. Saying
  // so costs a line; leaving it unsaid invites someone to compare it with the
  // reading on their own meter and conclude the app is wrong.
  const accounts = new Set(bills.map((b) => b.accountNumber).filter(Boolean)).size;

  return (
    <ScreenSection>
      <WaterUsageSummary usage={usage} />
      {accounts > 1 && (
        <ThemedText type="small" themeColor="textSecondary">
          Combined across your {accounts} water accounts.
        </ThemedText>
      )}
    </ScreenSection>
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

/**
 * Border colour for the balance card.
 *
 * Only two states are allowed to alarm: a bill that is late, and one due
 * within DUE_SOON_DAYS (5). Everything else rests on the ordinary element
 * border, so a consumer with three weeks to pay does not open the app to a
 * coloured warning about a bill that is simply... a bill.
 *
 * 'due-soon' was amber and is now danger, at the same time the window narrowed
 * to five days. Amber across a seven-day window meant the card spent about a
 * quarter of every billing cycle looking mildly urgent, which is how a colour
 * stops meaning anything. Now it stays quiet, then it means "pay this".
 */
function urgencyColor(urgency: Urgency, theme: ReturnType<typeof useTwdTheme>): string {
  switch (urgency) {
    case 'overdue':
    case 'due-soon':
      return theme.danger;
    case 'scheduled':
      // Neutral at rest — the card still reads as a card, not as a warning.
      return theme.border;
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

/**
 * What to call the person, in order of how well we actually know it.
 *
 *   1. The registry's own `firstName` — authoritative, and already separated
 *      from middle and last name by the portal. Compound given names ("Mark
 *      Jordan", "Ma. Cristina") survive because nothing is being parsed.
 *   2. `businessName` / `contactPersonName` for a commercial account, which
 *      has no firstName at all.
 *   3. The session's display name, for a password consumer whose profile call
 *      has not landed yet.
 *   4. The email's local part — the last resort for a Google session, which
 *      carries nothing else.
 *
 * Never derives a given name by splitting a full name: that guesses at where a
 * first name ends, and it guesses wrong on exactly the names most common here.
 */
function greetingName(
  profile: ConsumerProfile | null,
  sessionName: string | null,
  email: string | null
): string {
  const fromRegistry =
    profile?.firstName || profile?.businessName || profile?.contactPersonName;
  if (fromRegistry) return fromRegistry;

  if (sessionName) return sessionName;
  if (email) return email.includes('@') ? email.split('@')[0] : email;
  return 'there';
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
