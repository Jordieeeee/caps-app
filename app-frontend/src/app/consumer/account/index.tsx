import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  cancelLinkRequest,
  getProfile,
  listAccounts,
  listLinkRequests,
  type Account,
  type AccountLinkRequest,
  type ConsumerProfile,
} from '@/consumer/services/consumer-data';
import { formatDate } from '@/shared/format/date';
import { useAuth } from '@/shared/auth/auth-context';
import { Icon } from '@/shared/components/icon';
import { ListEmpty, ListError, ListLoading } from '@/shared/components/list-states';
import { ScreenContainer, ScreenSection } from '@/shared/components/screen-container';
import { ScreenHeader } from '@/shared/components/screen-header';
import { AccountStatusBadge, LinkRequestBadge } from '@/shared/components/status-badge';
import { ThemeToggle } from '@/shared/components/theme-toggle';
import { TwdButton } from '@/shared/components/twd-button';
import { formatPeso } from '@/shared/format/currency';
import { useAsync } from '@/shared/hooks/use-async';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { Radius, Spacing } from '@/shared/theme/twd';

/**
 * Account — linked water accounts, plus the things you do once and forget.
 *
 * Sign out lives here now. It was the only button on Home: a consumer's landing
 * screen offered them exactly one action, and it was leaving. It also fired
 * immediately on tap. Feedback moved in too — see consumer-tabs.tsx for why it
 * did not deserve a tab of its own.
 */
export default function ConsumerAccountScreen() {
  /**
   * Three independent reads, settled independently.
   *
   * `Promise.all` was wrong here the moment this screen grew a second source: it
   * rejects on the first failure, so a profile request that timed out would blank
   * the accounts list that had already arrived — and, before the restructure below,
   * would have taken Sign out down with it. `allSettled` lets each section report
   * its own outcome, which is also the truthful one.
   *
   * Pending link requests are the third. They fail softest of all: `null` hides the
   * section entirely rather than claiming a consumer has no requests open, which is
   * the wrong thing to say to someone deciding whether to send another one.
   *
   * Bills are deliberately not fetched. This screen used to pull the full bill
   * list purely to filter it per account for the balance row; the server now sends
   * `outstanding` on each account, so that request was a round trip whose result
   * could not be used against real data anyway.
   */
  const load = useCallback(async () => {
    const [accounts, profile, requests] = await Promise.allSettled([
      listAccounts(),
      getProfile(),
      listLinkRequests(),
    ]);
    return {
      accounts: accounts.status === 'fulfilled' ? accounts.value : null,
      profile: profile.status === 'fulfilled' ? profile.value : null,
      requests: requests.status === 'fulfilled' ? requests.value : null,
    };
  }, []);
  const { state, reload } = useAsync(load);

  // Editing details happens on a pushed screen, so the saved value has to be
  // picked up on the way back rather than only on a manual pull.
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  const data = state.status === 'ready' ? state.data : null;

  return (
    <ScreenContainer onRefresh={reload} refreshing={false}>
      <ScreenHeader title="Account" subtitle="Your details, water accounts and settings" />

      {state.status === 'loading' && (
        <ScreenSection>
          <ListLoading label="Loading your account…" />
        </ScreenSection>
      )}

      {data && <DetailsSection profile={data.profile} onRetry={reload} />}
      {data && <AccountsSection accounts={data.accounts} onRetry={reload} />}
      {data && <LinkRequestsSection requests={data.requests} onChanged={reload} />}

      {/* Rendered unconditionally, outside every data branch, on purpose.
          Sign out used to live inside the body that only rendered once the
          accounts request had succeeded — so the one state in which a consumer is
          most likely to want out of the app (nothing loading, network unhappy) was
          exactly the state that hid the button. Settings depend on the session,
          not on any fetch, so they are not gated on one. */}
      <SettingsSection />
    </ScreenContainer>
  );
}

/**
 * The consumer's water accounts, as the district's registry holds them.
 *
 * ⚠️ THIS SECTION USED TO BE EMPTY FOR EVERYONE. `GET /accounts` resolved ownership
 * through `Account.consumerIds`, a seed-script field whose every reference in the
 * district's database is dangling, so it returned `[]` for every real login and this
 * screen told consumers who own a meter to "link their first account". The server
 * now reads `serviceconnections`, the collection the portal actually maintains.
 *
 * The consequence for this screen is that linking is not a thing the app does. A row
 * here exists because TWD connected a meter to this person; there is no client-side
 * link to create and none to undo. Hence no "Link an account" button, no count
 * against a cap the app cannot enforce, and no Unlink — see AccountCard.
 */
function AccountsSection({
  accounts,
  onRetry,
}: {
  accounts: Account[] | null;
  /* Was `onChanged`, from when Unlink could mutate this list from inside a card.
     Nothing on this screen changes an account any more, so the only thing left to
     do is re-read after a failed one. */
  onRetry: () => void;
}) {
  const theme = useTwdTheme();
  const router = useRouter();

  if (!accounts) {
    return (
      <ScreenSection>
        <ListError
          title="Could not load your accounts"
          body="We couldn't reach Tanauan City Water District just now. Check your connection and try again."
          onRetry={onRetry}
        />
      </ScreenSection>
    );
  }

  return (
    <ScreenSection gap={Spacing.three}>
      {accounts.length === 0 ? (
        /* Not "link your first account" — that blamed the consumer for a record the
           district owns. An empty list means TWD has no service connection filed
           against this profile, which is something only the office can fix, so the
           copy says where to go instead of offering a button that cannot do it. */
        <ListEmpty
          icon="home"
          title="No water account yet"
          body="TWD hasn't connected a water account to your profile. If you have a TWD bill with an account number on it, you can ask the district to add it."
          action={{
            label: 'Request an account',
            onPress: () => router.push('/consumer/account/link-account'),
          }}
        />
      ) : (
        <>
          <View style={styles.countRow}>
            <ThemedText type="defaultBold">
              {accounts.length === 1 ? 'Your water account' : 'Your water accounts'}
            </ThemedText>
            {/* Only worth a count when there is something to count against. Beside
                the singular heading, "1 account" said the same word twice. */}
            {accounts.length > 1 && (
              <ThemedText type="small" themeColor="textSecondary">
                {accounts.length} accounts
              </ThemedText>
            )}
          </View>

          {accounts.map((account) => (
            <AccountCard key={account.id} account={account} />
          ))}

          {/* "Request", never "Link". The tap sends a message to the office; it does
              not attach anything, and the button is the first place that promise is
              made. See link-account.tsx. */}
          <TwdButton
            label="Request another account"
            icon="plus"
            variant="secondary"
            onPress={() => router.push('/consumer/account/link-account')}
            accessibilityHint="Asks TWD to add another water account to your profile"
          />

          <View
            style={[styles.limitNote, { borderColor: theme.border }]}
            accessible
            accessibilityRole="summary">
            <Icon name="info" size={20} color={theme.textSecondary} />
            <ThemedText type="small" themeColor="textSecondary" style={styles.limitText}>
              TWD staff add accounts by hand after checking who you are, so a request can
              take a few working days and you may be asked to visit the office with a
              valid ID.
            </ThemedText>
          </View>
        </>
      )}
    </ScreenSection>
  );
}

/**
 * Requests the consumer has filed, and what became of them.
 *
 * Its whole job is to stop a request from disappearing. Someone who sends one and
 * then sees the same unchanged Account tab has no way to tell whether it arrived, so
 * they send it again — which is how five identical rows reach a counter that only
 * needed one. Showing the request back, with its status, is what makes the send feel
 * like it landed somewhere.
 *
 * Decided requests stay listed rather than vanishing on approval. A row that
 * disappears is indistinguishable from one that was never sent, and "Approved" next
 * to an account that has now appeared above is the only place the consumer can see
 * those two facts connect.
 *
 * Renders nothing at all when there are no requests — an empty card headed "Your
 * requests" on the tab of a consumer who has never made one is furniture.
 */
function LinkRequestsSection({
  requests,
  onChanged,
}: {
  requests: AccountLinkRequest[] | null;
  onChanged: () => void;
}) {
  if (!requests || requests.length === 0) return null;

  return (
    <ScreenSection gap={Spacing.three}>
      <ThemedText type="defaultBold">Your account requests</ThemedText>
      {requests.map((request) => (
        <LinkRequestCard key={request.id} request={request} onChanged={onChanged} />
      ))}
    </ScreenSection>
  );
}

function LinkRequestCard({
  request,
  onChanged,
}: {
  request: AccountLinkRequest;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);

  /**
   * Withdrawing confirms first — not because it is dangerous, but because it is
   * quietly expensive: the office queue is worked by hand, and a consumer who
   * withdraws by mistake waits days for a request nobody has.
   */
  const confirmCancel = () => {
    Alert.alert(
      `Withdraw your request for ${request.accountNumber}?`,
      "TWD will no longer be asked to add this account. You can send a new request later if you change your mind.",
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Withdraw',
          style: 'destructive',
          onPress: () => {
            setBusy(true);
            void cancelLinkRequest(request.id)
              .then(onChanged)
              .catch(() =>
                Alert.alert(
                  'Could not withdraw',
                  "We couldn't reach TWD just now. The request still stands — try again in a moment.",
                  [{ text: 'OK' }]
                )
              )
              .finally(() => setBusy(false));
          },
        },
      ]
    );
  };

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderText}>
          <ThemedText type="defaultBold" style={styles.cardTitle}>
            {request.accountNumber}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Sent {formatDate(request.submittedAt)}
          </ThemedText>
        </View>
        <LinkRequestBadge status={request.status} />
      </View>

      {request.note && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.address}>
          Your note: {request.note}
        </ThemedText>
      )}

      {/* Rejection carries no reason because the server sends none — telling a
          consumer *why* would confirm the account exists and is held by someone
          else, which is the fact this whole flow refuses to disclose. The office can
          say more to a person standing in front of them. */}
      {request.status === 'rejected' && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.address}>
          TWD did not add this account. Visit the district office with a valid ID if you
          think this is a mistake.
        </ThemedText>
      )}

      {request.status === 'approved' && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.address}>
          TWD approved this. The account appears above once staff have finished adding it.
        </ThemedText>
      )}

      {request.status === 'pending' && (
        <TwdButton
          label="Withdraw request"
          variant="secondary"
          busy={busy}
          busyLabel="Withdrawing…"
          onPress={confirmCancel}
          accessibilityHint={`Asks you to confirm before withdrawing your request for ${request.accountNumber}`}
        />
      )}
    </ThemedView>
  );
}

/**
 * Everything the district holds about this consumer.
 *
 * Shown in full rather than summarised, because the point of the section is to let
 * someone check it. A wrong barangay is why a bill never arrives and a misspelt
 * surname is why the counter cannot find them, and until now neither was
 * discoverable from the app at all — the profile card here was a name and an email,
 * both of which the consumer already knew.
 *
 * Rows whose value the district does not hold say so ("Not on file") instead of
 * being hidden. A missing row is indistinguishable from a row that scrolled past;
 * an explicit blank is a prompt to go and get it filled in.
 */
function DetailsSection({
  profile,
  onRetry,
}: {
  profile: ConsumerProfile | null;
  onRetry: () => void;
}) {
  const theme = useTwdTheme();
  const router = useRouter();

  if (!profile) {
    return (
      <ScreenSection>
        <ListError
          title="Could not load your details"
          body="We couldn't reach Tanauan City Water District just now. Check your connection and try again."
          onRetry={onRetry}
        />
      </ScreenSection>
    );
  }

  const address = profile.mailingAddress;
  const addressLine = address
    ? [address.houseStreet, address.barangay, address.city, address.province, address.zip]
        .filter(Boolean)
        .join(', ')
    : '';

  return (
    <ScreenSection gap={Spacing.three}>
      <View style={styles.countRow}>
        <ThemedText type="defaultBold">Your details</ThemedText>
        {profile.consumerNo && (
          <ThemedText type="small" themeColor="textSecondary">
            {profile.consumerNo}
          </ThemedText>
        )}
      </View>

      <ThemedView type="backgroundElement" style={styles.card}>
        <DetailRow label="Name" value={profile.name} />
        {profile.consumerType === 'business' && (
          <DetailRow label="Contact person" value={profile.contactPersonName} />
        )}
        <DetailRow label="Email" value={profile.email} />
        <DetailRow label="Mobile number" value={profile.contactNumber} />
        <DetailRow label="Mailing address" value={addressLine} />
        {profile.consumerType !== 'business' && (
          <DetailRow label="Date of birth" value={formatDate(profile.birthDate ?? undefined)} />
        )}
        <DetailRow
          label="Valid ID"
          value={
            profile.validId?.idNumber
              ? `${profile.validId.idType ?? 'ID'} · ${profile.validId.idNumber}`
              : ''
          }
        />
        {/* Shown because it changes what the consumer pays — a senior citizen is
            entitled to a statutory discount, so someone who qualifies and is
            recorded as "No" needs to see that and bring their ID to the office. */}
        <DetailRow label="Senior citizen" value={profile.isSeniorCitizen ? 'Yes' : 'No'} />
        <DetailRow
          label="Customer since"
          value={formatDate(profile.memberSince ?? undefined)}
          last
        />
      </ThemedView>

      <TwdButton
        label="Edit my details"
        icon="plus"
        variant="secondary"
        onPress={() => router.push('/consumer/account/edit-details')}
        accessibilityHint="Change your mobile number or mailing address"
      />

      <View
        style={[styles.limitNote, { borderColor: theme.border }]}
        accessible
        accessibilityRole="summary">
        <Icon name="info" size={20} color={theme.textSecondary} />
        <ThemedText type="small" themeColor="textSecondary" style={styles.limitText}>
          You can change your mobile number and mailing address here. Your name, date of
          birth, valid ID and senior citizen status are changed at the TWD office, with
          the supporting document.
        </ThemedText>
      </View>
    </ScreenSection>
  );
}

function DetailRow({
  label,
  value,
  last,
}: {
  label: string;
  value: string | null | undefined;
  last?: boolean;
}) {
  const theme = useTwdTheme();
  const known = !!value;

  return (
    <View style={[styles.detailRow, last ? null : { borderBottomColor: theme.border, borderBottomWidth: 1 }]}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.detailLabel}>
        {label}
      </ThemedText>
      <ThemedText
        type={known ? 'defaultBold' : 'small'}
        style={[styles.detailValue, known ? null : { color: theme.textSecondary }]}>
        {known ? value : 'Not on file'}
      </ThemedText>
    </View>
  );
}

/**
 * One linked account, with the things a consumer needs beside the number.
 *
 * The old card showed the account number, the address, a type row, and a "Linked
 * Date" row — the date the record was created, which answers a question nobody
 * has. What it did not show was the balance. A consumer looking at their accounts
 * wants to know which one owes money; that took a trip to another tab.
 */
/** The three rate classes the registry stores, worded for a consumer. */
const ACCOUNT_TYPE_LABEL: Record<Account['type'], string> = {
  residential: 'Residential',
  commercial: 'Commercial',
  government: 'Government',
};

function AccountCard({ account }: { account: Account }) {
  const theme = useTwdTheme();
  const router = useRouter();

  /**
   * The balance comes from the server, not from filtering bills by account.
   *
   * That filter (`bills.filter(b => b.accountNumber === account.accountNumber)`)
   * worked only against the mock, where every bill carried an account number. Real
   * bills issued by the portal reference a *consumer* and no account at all, so the
   * filter matched nothing and every card would have read "Paid up" — including for
   * a household deep in arrears, which is the worst possible direction for this
   * particular error.
   *
   * `outstanding` is null when the district's data cannot attribute a balance to
   * this account alone (a meter shared by several consumers). Null is rendered as a
   * pointer to the total, never as ₱0.00.
   */
  const { outstanding, paymentStatus } = account;
  const known = outstanding !== null;
  const owes = known && outstanding > 0;
  const dueColor = !known
    ? theme.textSecondary
    : paymentStatus === 'Past Due'
      ? theme.danger
      : owes
        ? theme.warning
        : theme.success;

  /**
   * "This isn't my account" — a report, not an unlink.
   *
   * The button here was Unlink, and it has to go rather than be re-wired. It called
   * DELETE /accounts/:accountNumber, which removed the caller from
   * `Account.consumerIds` — a field nothing reads now that the list is sourced from
   * the district's `serviceconnections` registry. The account came back on the next
   * refresh, after the app had said it was removed. The server refuses it outright
   * for that reason (403), and the registry is read-only from the mobile backend by
   * design, so there is no version of this button that could work.
   *
   * What a consumer actually needs from it is unchanged: a way to say "this record
   * is wrong". That is a message to the office, so it opens the feedback form with
   * the account number already filled in — prefilled rather than posted silently,
   * because the consumer should see and be able to edit what goes to the district in
   * their name.
   */
  const reportNotMine = () => {
    router.push({
      pathname: '/consumer/notices/feedback',
      params: {
        type: 'other',
        subject: `${account.accountNumber} is not my account`,
        message:
          `The water account ${account.accountNumber} appears in my app, but it isn't mine. ` +
          'Please check my records and remove it.',
      },
    });
  };

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.cardHeader}>
        {/* 🏠 / 🏢 previously, at fontSize 24 — a different vendor's artwork on
            every OS, ignoring the theme, announced by screen readers as "house". */}
        <Icon name={account.type === 'residential' ? 'home' : 'building'} size={24} color={theme.primary} />
        <View style={styles.cardHeaderText}>
          <ThemedText type="defaultBold" style={styles.cardTitle}>
            {account.accountNumber}
          </ThemedText>
          {/* Through the map, not a ternary. The old `=== 'commercial' ? … : 'Residential'`
              printed "Residential" for a government account, and the district has
              live government connections — a real one is ACC-2026-0005. */}
          <ThemedText type="small" themeColor="textSecondary">
            {ACCOUNT_TYPE_LABEL[account.type] ?? 'Residential'}
          </ThemedText>
        </View>
        <AccountStatusBadge status={account.status} />
      </View>

      <ThemedText type="small" themeColor="textSecondary" style={styles.address}>
        {account.address}
      </ThemedText>

      <View style={[styles.balanceRow, { borderTopColor: theme.border }]}>
        <ThemedText type="small" themeColor="textSecondary">
          {owes ? 'Outstanding' : 'Balance'}
        </ThemedText>
        <ThemedText type="defaultBold" style={{ color: dueColor }}>
          {!known ? 'See total balance' : owes ? formatPeso(outstanding) : 'Paid up'}
        </ThemedText>
      </View>

      {/* Secondary, not danger. Reporting a wrong record destroys nothing — the red
          treatment belonged to the Unlink this replaces, and keeping it would warn
          a consumer away from the one action that gets the mistake fixed. */}
      <TwdButton
        label="This isn't my account"
        variant="secondary"
        onPress={reportNotMine}
        accessibilityHint={`Opens a message to TWD about ${account.accountNumber}, which you can edit before sending`}
      />
    </ThemedView>
  );
}

function SettingsSection() {
  const { signOut } = useAuth();

  /**
   * Sign out confirms, but stays light about it.
   *
   * Deliberately not the collector's treatment: a collector signing out can lose
   * a shift of unsynced field work, so that screen counts the records at risk and
   * argues. A consumer has nothing cached — the consumer path requires a live auth
   * call by design — so the only cost is typing a password again. Borrowing the
   * collector's alarm here would be theatre, and an app that shouts about
   * everything gets ignored when it shouts about something.
   */
  const confirmSignOut = () => {
    Alert.alert('Sign out?', "You'll need your email and password to sign back in.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
    ]);
  };

  // The name/email card that used to sit here is gone: DetailsSection above shows
  // both, sourced from the district's registry rather than from the cached
  // session, and two copies of a name is how they end up disagreeing after an edit.
  return (
    <>
      <ScreenSection gap={Spacing.two}>
        <ThemedText type="defaultBold">Appearance</ThemedText>
        <ThemeToggle />
        <ThemedText type="small" themeColor="textSecondary">
          Choose how the app looks on this phone, or let it follow your phone&apos;s own
          setting.
        </ThemedText>
      </ScreenSection>

      <ScreenSection gap={Spacing.three}>
        {/* Send feedback and Your feedback were here. They are on Notices now: that
            tab is what the district says to the consumer, and feedback is the same
            conversation in the other direction — whereas this screen is a settings
            drawer, where someone looks for what their record says about them. See
            consumer/notices/_layout.tsx. */}
        <TwdButton
          label="Sign out"
          icon="log-out"
          variant="danger"
          onPress={confirmSignOut}
          accessibilityHint="Asks you to confirm before ending your session"
        />

        <ThemedText type="small" themeColor="textSecondary" style={styles.footer}>
          Tanauan City Water District
        </ThemedText>
      </ScreenSection>
    </>
  );
}

/* `promptLinkNotBuilt` was here — an alert saying linking was "coming soon", behind
   a button on a screen that showed no accounts at all. Both are gone: the accounts
   were always there, in `serviceconnections`, and the app was reading the wrong
   join. When the office-approval flow lands, its entry point replaces the note at
   the foot of AccountsSection. */

const styles = StyleSheet.create({
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  card: {
    borderRadius: Radius.card,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  cardHeaderText: { flex: 1 },
  cardTitle: { fontSize: 16 },
  address: { lineHeight: 20 },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.three,
    borderTopWidth: 1,
  },
  limitNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.card,
    borderWidth: 2,
  },
  limitText: { flex: 1 },
  /**
   * Label and value share a row and both may wrap.
   *
   * `flex: 1` on the value is what keeps a long mailing address inside the card:
   * without it the value reports its full unwrapped width as the row's intrinsic
   * width, which propagates up and pushes the card past the viewport — the same
   * defect already documented on `detailValue` in collector/service-reports.tsx.
   */
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
  },
  detailLabel: { flexShrink: 0 },
  detailValue: { flex: 1, textAlign: 'right' },
  footer: { textAlign: 'center', marginTop: Spacing.two },
});
