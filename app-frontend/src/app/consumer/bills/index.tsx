import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { listAccounts, listBills, type Account, type Bill } from '@/consumer/services/consumer-data';
import { dueLabel, daysUntil, summarise } from '@/consumer/lib/bill-summary';
import { formatCuM, usageFor } from '@/consumer/lib/usage-summary';
import {
  accountsInMonth,
  billsInMonth,
  monthChipsFor,
} from '@/consumer/lib/month-filter';
import { WaterUsageCard } from '@/consumer/components/water-usage';
import { LatestReadingCards } from '@/consumer/components/latest-reading';
import { accountChipsFor } from '@/consumer/lib/account-label';
import { FilterChips } from '@/shared/components/filter-chips';
import { Icon } from '@/shared/components/icon';
import { ListEmpty, ListError } from '@/shared/components/list-states';
import { SkeletonList } from '@/shared/components/skeleton';
import { RefreshButton, RefreshFailedNotice } from '@/shared/components/refresh-button';
import { ScreenContainer, ScreenSection } from '@/shared/components/screen-container';
import { ScreenHeader } from '@/shared/components/screen-header';
import { PaymentBadge } from '@/shared/components/status-badge';
import { TwdButton } from '@/shared/components/twd-button';
import { formatPeso } from '@/shared/format/currency';
import { formatBillingPeriod, formatDate } from '@/shared/format/date';
import { useAsync } from '@/shared/hooks/use-async';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { Radius, Spacing } from '@/shared/theme/twd';

/**
 * Bills — what's owed now, and everything that came before.
 *
 * This is Billing and Payments merged. They were two tabs showing one thing: a
 * "Billing History" list of past bills, and a "Payment Notifications" list of the
 * same bills before they were paid, with a nudge attached. Splitting a consumer's
 * bills by whether they had been paid yet made the app's filing system the user's
 * problem — "my June bill" lived in a different tab depending on the date.
 *
 * The nudge survived the merge; the "Recommendation" boxes did not. They read
 * "Payment due in 5 days. To avoid late fees, we recommend processing payment
 * today." — a paragraph of advice restating a due date the card already showed.
 * Urgency now lives in the due label and the card's border tone, which cost no
 * lines of reading.
 */
export default function ConsumerBillsScreen() {
  const router = useRouter();
  const { state, reload, refresh, refreshing, refreshFailed } = useAsync(
    useCallback(
      async () => ({
        bills: await listBills(),
        // Accounts are for LABELLING the filter only, so a failure here must not
        // take the bills down with it. An empty list degrades the chips to bare
        // account numbers, which still work — bills without their labels are a
        // worse screen than labels without their prettiness.
        accounts: await listAccounts().catch(() => [] as Account[]),
      }),
      []
    )
  );
  const [filter, setFilter] = useState<string | null>(null);
  const [accountFilter, setAccountFilter] = useState<string | null>(null);
  /** `YYYY-MM`, or null for every month. */
  const [monthFilter, setMonthFilter] = useState<string | null>(null);

  return (
    <ScreenContainer onRefresh={() => void refresh()} refreshing={refreshing}>
      <ScreenHeader
        title="Bills"
        subtitle="What you owe and what you've paid"
        action={<RefreshButton onPress={() => void refresh()} busy={refreshing} subject="bills" />}
      />

      {/* Only alongside rows that are actually on screen. If the very first load
          failed there is nothing stale to caveat, and the error state below says
          it better. */}
      {state.status === 'ready' && refreshFailed && <RefreshFailedNotice subject="bills" />}

      {state.status === 'loading' && (
        <ScreenSection>
          <SkeletonList count={3} label="Loading your bills" />
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

      {state.status === 'ready' && (
        <BillsBody
          bills={state.data.bills}
          accounts={state.data.accounts}
          filter={filter}
          onFilter={setFilter}
          accountFilter={accountFilter}
          onAccountFilter={setAccountFilter}
          monthFilter={monthFilter}
          onMonthFilter={setMonthFilter}
          onHowToPay={() => router.push('/consumer/bills/how-to-pay')}
        />
      )}
    </ScreenContainer>
  );
}

interface BillsBodyProps {
  bills: Bill[];
  accounts: Account[];
  filter: string | null;
  onFilter: (id: string | null) => void;
  accountFilter: string | null;
  onAccountFilter: (id: string | null) => void;
  monthFilter: string | null;
  onMonthFilter: (id: string | null) => void;
  onHowToPay: () => void;
}

function BillsBody({
  bills,
  accounts,
  filter,
  onFilter,
  accountFilter,
  onAccountFilter,
  monthFilter,
  onMonthFilter,
  onHowToPay,
}: BillsBodyProps) {
  /**
   * Does this list cover more than one water account?
   *
   * Derived from the bills themselves rather than fetched, so the label appears
   * exactly when it disambiguates and never otherwise. A consumer with one house
   * gets no extra chrome; a consumer with two never has to guess which property
   * a row belongs to — and guessing there means paying one bill believing both
   * are cleared. Computed over ALL bills, not the filtered `visible` set, so the
   * label does not flicker away when a filter happens to narrow to one account.
   */
  const spansAccounts =
    new Set(bills.map((b) => b.accountNumber).filter(Boolean)).size > 1;
  const theme = useTwdTheme();
  /**
   * Account filter first, status second, and everything below reads from the
   * account-scoped set rather than from `bills`.
   *
   * That is the whole point of the filter, not a detail: picking "Boot" and
   * still seeing an Outstanding tile of ₱2,144 — the total across both
   * properties — is the exact confusion this screen exists to remove. The
   * summary, the usage chart and the status counts all narrow together.
   *
   * The STATUS filter deliberately does not feed them. Choosing "Paid" changes
   * which rows you are reading; it does not change what you owe.
   */
  const inAccount = accountFilter
    ? bills.filter((b) => b.accountNumber === accountFilter)
    : bills;

  /**
   * Month narrows the LIST, not the money — the same rule the status filter
   * follows, and for the same reason.
   *
   * Account is a scope: a consumer with two properties genuinely has two separate
   * balances, so picking one has to move the Outstanding tile with it. A month is
   * not a scope, it is a place to look. "What you owe" is a fact about today,
   * arrived at by adding up every unpaid bill whenever it was issued, and it does
   * not become a smaller number because someone scrolled back to June. A tile that
   * fell to ₱200.00 while a household actually owed ₱1,400 would be read as the
   * amount to bring to the counter.
   *
   * So the TILES keep reading from `inAccount`. The usage card and the unbilled
   * reading do not: those are not money, they are history, and history is exactly
   * the thing a month filter is for. Tapping `Jun 2026` and being shown June's
   * bills under a usage card still headlining August is the filter half-applied —
   * the reader has to hold in their head which parts of the screen moved.
   */
  const inMonth = billsInMonth(inAccount, monthFilter);
  const visible = filter ? inMonth.filter((b) => b.status === filter) : inMonth;

  const { totalDue, unknownAmounts, outstanding } = summarise(inAccount);
  const usage = usageFor(inAccount, monthFilter);

  const totalPaid = inAccount
    .filter((b) => b.status === 'paid')
    .reduce((sum, b) => sum + (b.amount ?? 0), 0);

  /**
   * One chip per account that actually has bills, labelled by PLACE.
   *
   * Account numbers are the wrong label for a chooser: ACC-2026-0007 and
   * ACC-2026-0008 differ by one character in the middle of sixteen, which is a
   * reading test rather than a choice. People know their properties by where
   * they are — the Boot one, the Wawa one — so the chip carries the service
   * address's distinctive part and the account number stays on every bill row
   * underneath, where the exact identifier belongs.
   */
  const accountChips = accountChipsFor(bills, accounts);

  /** The account filter, applied to the accounts themselves. */
  const accountsFor = (rows: Account[], accountNumber: string | null) =>
    accountNumber ? rows.filter((a) => a.accountNumber === accountNumber) : rows;

  /**
   * Status chips, minus the ones that would filter to nothing.
   *
   * "Overdue 0" and "Paid 0" sat side by side on a screen holding one unpaid
   * bill: two of the four controls did nothing, and tapping either emptied the
   * list. That is the same defect `accountChipsFor` already avoids one row above
   * — its comment calls a chip that filters to an empty screen "a broken control
   * rather than 'nothing billed here yet'" — and the status row was simply never
   * held to it.
   *
   * The zero is not information worth a control. "You have no overdue bills" is
   * already said, and said better, by the Outstanding tile above and by the list
   * itself; a greyed pill saying `Overdue 0` makes the reader check whether the
   * filter is broken.
   *
   * The SELECTED chip survives at zero, always. Dropping the control someone is
   * standing on would make the row reshuffle under their finger and leave the
   * screen filtered by something no longer on it — with no way back but "All".
   */
  const statusChips = [
    // Counted within the account AND month already chosen, not across everything.
    // A chip reading "Overdue 4" beside a list showing two is the kind of small
    // lie that makes someone distrust the total — and it would say exactly that
    // if these counted `inAccount` while the rows underneath came from `inMonth`.
    { id: 'overdue', label: 'Overdue', count: inMonth.filter((b) => b.status === 'overdue').length },
    { id: 'pending', label: 'Unpaid', count: inMonth.filter((b) => b.status === 'pending').length },
    { id: 'paid', label: 'Paid', count: inMonth.filter((b) => b.status === 'paid').length },
  ].filter((chip) => chip.count > 0 || chip.id === filter);

  /**
   * The month row, derived in consumer/lib/month-filter.ts so Home's row and this
   * one cannot drift — see that file on why periods come from unbilled READINGS as
   * well as from bills, and why a reading-only month carries no count.
   *
   * Scoped to the chosen ACCOUNT and not to the chosen status: a chip counts what
   * the month would show you if you tapped it, and tapping a month does not change
   * the status filter.
   */
  const monthChips = monthChipsFor(inAccount, accountsFor(accounts, accountFilter), monthFilter);

  /**
   * The month row is ALWAYS drawn, and that is a deliberate departure from the
   * account row directly above it.
   *
   * By this file's other rule it would be hidden on a single billing period — one
   * chip beside "All months" is a control whose every state shows the same rows,
   * which is why `spansAccounts` exists and why the status row now drops its zeros.
   * The month row is exempt because it is the one filter people go looking for:
   * "show me June" is the reason someone opens a bills list they have already
   * read, and a control that is absent on a household's first month and appears
   * unannounced on their second is one they have to discover twice. A row that is
   * always in the same place is worth more here than a row that is never inert.
   *
   * The cost is real and bounded: exactly one dead chip, for exactly as long as a
   * household has one billing period.
   */

  if (bills.length === 0) {
    return (
      <>
        {/**
         * The reading shows here too, and this is the case where it matters most.
         *
         * A household on its first billing cycle has no bills at all — so without
         * this, the consumer whose meter was read this morning opens Bills and is
         * told "No bills yet", full stop, with nothing anywhere in the app
         * acknowledging the visit. That is the exact silence this card exists to
         * end, and the empty state is where the silence was loudest.
         *
         * Above the empty state rather than below it: the reading is the more
         * recent and more specific fact, and "nothing has been billed" reads
         * better as the explanation underneath it than as the headline over it.
         */}
        <LatestReadingCards accounts={accounts} />

        <ScreenSection>
          <ListEmpty
            icon="file-text"
            title="No bills yet"
            body="Once TWD issues a bill for your linked account, it will appear here with its due date."
          />
        </ScreenSection>
      </>
    );
  }

  return (
    <>
      {/* Two tiles, not three. Money needs the width — three peso figures across a
          375px screen is what wrapped "₱18500.00" into "₱1850" / "0.00" on the
          collector's report tiles.

          And two only while there are two figures to state. "Paid to date ₱0.00"
          took half the row to report an absence, on the screen where the other
          half is the number the consumer opened the app for. Nothing paid is the
          starting state of every new account and of every household TWD has not
          recorded a payment for — see the note further down on the portal not
          stamping payment dates — so this is the ordinary case, not an edge one.
          The Outstanding figure takes the full width until there is a payment
          worth naming beside it. */}
      <ScreenSection gap={Spacing.three}>
        <View style={styles.tiles}>
          <ThemedView type="backgroundElement" style={styles.tile}>
            <ThemedText type="small" themeColor="textSecondary">
              Outstanding
            </ThemedText>
            <ThemedText
              style={[styles.tileAmount, { color: totalDue > 0 ? theme.danger : theme.success }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.6}>
              {formatPeso(totalDue)}
            </ThemedText>
          </ThemedView>
          {totalPaid > 0 && (
            <ThemedView type="backgroundElement" style={styles.tile}>
              <ThemedText type="small" themeColor="textSecondary">
                Paid to date
              </ThemedText>
              <ThemedText
                style={styles.tileAmount}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}>
                {formatPeso(totalPaid)}
              </ThemedText>
            </ThemedView>
          )}
        </View>

        {/* Said out loud, because a total that silently drops a bill is how someone
            arrives at the counter with too little money. */}
        {unknownAmounts > 0 && (
          <ThemedText type="small" themeColor="textSecondary">
            {unknownAmounts === 1
              ? 'One unpaid bill has no amount on file, so the outstanding total is at least this much. Ask at the TWD office for the full figure.'
              : `${unknownAmounts} unpaid bills have no amount on file, so the outstanding total is at least this much. Ask at the TWD office for the full figure.`}
          </ThemedText>
        )}

        {outstanding.length > 0 && (
          <TwdButton
            label="How to pay"
            icon="wallet"
            onPress={onHowToPay}
            accessibilityHint="Shows where and how to pay your TWD bill"
          />
        )}
      </ScreenSection>

      {/* Above the bill list, below the money: it explains the amounts underneath
          it, so it has to be read before them. Home shows the same figures in
          `WaterUsageSummary`, from this same derivation — see
          consumer/components/water-usage.tsx. */}
      {usage && (
        <ScreenSection>
          <WaterUsageCard usage={usage} />
        </ScreenSection>
      )}

      {/**
       * The reading that has no bill yet, immediately above the bills that do.
       *
       * This screen is a timeline of a household's billing, and a meter already
       * read is the head of it — the next row, not yet issued. Putting it here
       * answers the question the list provokes on the day a collector calls: "my
       * meter was read this morning, so where is it?" Below the usage card,
       * because that card is about months TWD has billed and this is explicitly
       * about one it has not.
       *
       * It narrows with the ACCOUNT and MONTH filters and not with the STATUS
       * filter. Choosing "Boot" is choosing a property and must scope every figure;
       * choosing "Sep 2026" is choosing a period, and a reading taken in September
       * is not part of June however you filter the bills. Choosing "Unpaid" is a
       * reading of the bills that are there, and has nothing to say about a reading
       * that is not a bill at all — a reading has no payment status to match.
       *
       * The month chips include this reading's own period precisely so the filter
       * can land on it; see consumer/lib/month-filter.ts.
       *
       * Same component as Home renders — see consumer/components/latest-reading.
       */}
      <LatestReadingCards
        accounts={accountsInMonth(accountsFor(accounts, accountFilter), monthFilter)}
      />

      <ScreenSection gap={Spacing.three}>
        <ThemedText type="defaultBold">Your bills</ThemedText>

        {/* Account above Status, and only when there is a choice to make.
            One account means one chip, which is a control that cannot do
            anything — so it is not drawn at all and the screen is exactly what
            it was before this feature existed.

            Both rows carry a title once both are present. FilterChips documents
            why: two unlabelled rows of pills are a puzzle, and the collector's
            route screen already stacks Barangay above Status this way. */}
        {spansAccounts && (
          <FilterChips
            title="Account"
            chips={accountChips}
            selectedId={accountFilter}
            onSelect={onAccountFilter}
            allLabel="All accounts"
            allCount={bills.length}
            accessibilityLabel="Filter bills by water account"
          />
        )}

        {/* Between Account and Status, because it belongs with Account: both
            narrow WHICH bills are in view, while Status is a reading of whatever
            is left — which is also the order the counts flow in, since the status
            counts above are computed after this row has had its say. */}
        <FilterChips
          title="Month"
          chips={monthChips}
          selectedId={monthFilter}
          onSelect={onMonthFilter}
          allLabel="All months"
          allCount={inAccount.length}
          accessibilityLabel="Filter bills by billing month"
        />

        {/* Always titled now: the Month row above is always present, so Status
            always has a sibling — and FilterChips' rule is that two unlabelled
            rows of pills are a puzzle. The old conditional dated from when Status
            could be the only row on the screen, which it no longer can be. */}
        <FilterChips
          title="Status"
          chips={statusChips}
          selectedId={filter}
          onSelect={onFilter}
          allLabel="All"
          allCount={inMonth.length}
          accessibilityLabel="Filter bills by status"
        />

        {/**
         * The empty state names the filter that actually emptied the list, and
         * offers to clear THAT one.
         *
         * There is now more than one control that can empty this list, and a single
         * "No bills with this status / Show all" was wrong for the new one twice
         * over: it blamed the status filter for a month filter's doing, and its
         * button cleared the status — leaving the screen just as empty, which reads
         * as a broken button rather than as a filter still in force.
         *
         * The month case is not an error and must not be phrased as one. Every
         * period carrying only an unbilled reading has a chip (see
         * consumer/lib/month-filter.ts), so landing here with the reading card
         * visible directly above is the ORDINARY result of tapping the current
         * month — the household's meter has been read and TWD has not billed it
         * yet. "Nothing matches" would tell them their reading is missing while it
         * is on screen.
         */}
        {visible.length === 0 &&
          (monthFilter && inMonth.length === 0 ? (
            <ListEmpty
              icon="file-text"
              title={`No bills for ${formatBillingPeriod(monthFilter)}`}
              body="TWD has not issued a bill for this month yet. Any meter reading already taken for it is shown above."
              action={{ label: 'All months', onPress: () => onMonthFilter(null) }}
            />
          ) : (
            <ListEmpty
              icon="file-text"
              title="No bills with this status"
              body="Nothing matches the selected filter. Clear it to see every bill."
              action={{ label: 'Show all', onPress: () => onFilter(null) }}
            />
          ))}

        {visible.map((bill) => (
          <BillCard key={bill.id} bill={bill} showAccount={spansAccounts} />
        ))}
      </ScreenSection>
    </>
  );
}

function BillCard({ bill, showAccount }: { bill: Bill; showAccount: boolean }) {
  const theme = useTwdTheme();
  const unpaid = bill.status !== 'paid';
  const days = unpaid ? daysUntil(bill.dueDate) : null;

  const isLate = bill.status === 'overdue' || (days !== null && days < 0);
  const isSoon = !isLate && days !== null && days <= 7;
  const accent = isLate ? theme.danger : isSoon ? theme.warning : theme.border;
  const dueColor = isLate ? theme.danger : isSoon ? theme.warning : theme.textSecondary;

  return (
    <ThemedView type="backgroundElement" style={[styles.card, { borderColor: accent }]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderText}>
          <ThemedText type="defaultBold" style={styles.cardTitle}>
            {formatBillingPeriod(bill.billingPeriod)}
          </ThemedText>
          {/* The account number is back, and only when it earns its place.
              It was removed when bills genuinely did not carry one; they now do
              (billingController resolves it from connectionId), and a consumer
              holding two properties cannot read this list safely without it.
              "Account not recorded" for a legacy bill with no connectionId —
              never a guess, because a bill filed under the wrong roof is the
              failure this label exists to prevent. */}
          {showAccount && (
            <ThemedText type="small" themeColor="textSecondary">
              {bill.accountNumber ?? 'Account not recorded'}
            </ThemedText>
          )}
          <ThemedText type="small" themeColor="textSecondary">
            Due {formatDate(bill.dueDate)}
          </ThemedText>
        </View>
        <PaymentBadge status={bill.status} />
      </View>

      <View style={styles.amountRow}>
        <ThemedText
          style={styles.cardAmount}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}>
          {/* Not ₱0.00 when the bill carries no total — see Bill.amount. */}
          {bill.amount === null ? 'Amount unavailable' : formatPeso(bill.amount)}
        </ThemedText>
        {unpaid && (
          <View style={styles.dueRow}>
            <Icon name={isLate ? 'alert-triangle' : 'calendar'} size={16} color={dueColor} />
            <ThemedText type="smallBold" style={{ color: dueColor }}>
              {dueLabel(days)}
            </ThemedText>
          </View>
        )}
      </View>

      <View style={styles.details}>
        <View style={styles.detailRow}>
          <ThemedText type="small" themeColor="textSecondary">
            Due date
          </ThemedText>
          {/* Formatted, not the raw ISO timestamp this row used to print. */}
          <ThemedText type="small">{formatDate(bill.dueDate)}</ThemedText>
        </View>

        {/* What the money was for. A peso figure with no volume beside it is not
            something a household can sanity-check against their own use. */}
        <View style={styles.detailRow}>
          <ThemedText type="small" themeColor="textSecondary">
            Water used
          </ThemedText>
          <ThemedText type="small">
            {bill.consumptionCuM === null ? 'Not recorded' : formatCuM(bill.consumptionCuM)}
          </ThemedText>
        </View>

        {bill.previousReading !== null && bill.currentReading !== null && (
          <View style={styles.detailRow}>
            <ThemedText type="small" themeColor="textSecondary">
              Meter reading
            </ThemedText>
            <ThemedText type="small">
              {bill.previousReading} → {bill.currentReading}
            </ThemedText>
          </View>
        )}

        {/* Only when the portal actually stamped them. Its billing run marks a bill
            PAID without recording when or how, and blank rows labelled "Paid on"
            read as missing data about a payment rather than about our schema. */}
        {bill.status === 'paid' && bill.paymentDate && (
          <View style={styles.detailRow}>
            <ThemedText type="small" themeColor="textSecondary">
              Paid on
            </ThemedText>
            <ThemedText type="small">{formatDate(bill.paymentDate)}</ThemedText>
          </View>
        )}
        {bill.status === 'paid' && bill.paymentMethod && (
          <View style={styles.detailRow}>
            <ThemedText type="small" themeColor="textSecondary">
              Paid via
            </ThemedText>
            <ThemedText type="small">{bill.paymentMethod}</ThemedText>
          </View>
        )}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  tiles: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  tile: {
    flex: 1,
    borderRadius: Radius.card,
    padding: Spacing.three,
    gap: Spacing.one,
    alignItems: 'center',
  },
  tileAmount: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
  },
  card: {
    borderRadius: Radius.card,
    borderWidth: 2,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  cardHeaderText: { flex: 1 },
  cardTitle: { fontSize: 16 },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  cardAmount: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
  },
  dueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  details: { gap: Spacing.two },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
