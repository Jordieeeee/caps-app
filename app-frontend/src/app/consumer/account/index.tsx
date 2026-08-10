import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MAX_ACCOUNTS } from '@/consumer/types';
import {
  getProfile,
  listAccounts,
  unlinkAccount,
  type Account,
  type ConsumerProfile,
} from '@/consumer/services/consumer-data';
import { formatDate } from '@/shared/format/date';
import { useAuth } from '@/shared/auth/auth-context';
import { Icon } from '@/shared/components/icon';
import { ListEmpty, ListError, ListLoading } from '@/shared/components/list-states';
import { ScreenContainer, ScreenSection } from '@/shared/components/screen-container';
import { ScreenHeader } from '@/shared/components/screen-header';
import { AccountStatusBadge } from '@/shared/components/status-badge';
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
   * Two independent reads, settled independently.
   *
   * `Promise.all` was wrong here the moment this screen grew a second source: it
   * rejects on the first failure, so a profile request that timed out would blank
   * the linked-accounts list that had already arrived — and, before the
   * restructure below, would have taken Sign out down with it. `allSettled` lets
   * each section report its own outcome, which is also the truthful one.
   *
   * Bills are deliberately not fetched. This screen used to pull the full bill
   * list purely to filter it per account for the balance row; the server now sends
   * `outstanding` on each account, so that request was a round trip whose result
   * could not be used against real data anyway.
   */
  const load = useCallback(async () => {
    const [accounts, profile] = await Promise.allSettled([listAccounts(), getProfile()]);
    return {
      accounts: accounts.status === 'fulfilled' ? accounts.value : null,
      profile: profile.status === 'fulfilled' ? profile.value : null,
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
      {data && <AccountsSection accounts={data.accounts} onChanged={reload} />}

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

function AccountsSection({
  accounts,
  onChanged,
}: {
  accounts: Account[] | null;
  onChanged: () => void;
}) {
  const theme = useTwdTheme();

  if (!accounts) {
    return (
      <ScreenSection>
        <ListError
          title="Could not load your accounts"
          body="We couldn't reach Tanauan City Water District just now. Check your connection and try again."
          onRetry={onChanged}
        />
      </ScreenSection>
    );
  }

  const canAdd = accounts.length < MAX_ACCOUNTS;

  return (
    <>
      <ScreenSection gap={Spacing.three}>
        {accounts.length === 0 ? (
          // First run. The whole module is inert until this is done, so it gets the
          // screen rather than a line of grey text — the old copy ("You have not
          // linked a water account yet") sat inside a card as a passive statement
          // with nothing to tap.
          <ListEmpty
            icon="home"
            title="Link your first account"
            body="Enter the account number printed on your TWD bill. You can link up to 5 accounts — useful if you pay for more than one property."
            action={{ label: 'Link an account', onPress: () => promptLinkNotBuilt() }}
          />
        ) : (
          <>
            <View style={styles.countRow}>
              <ThemedText type="defaultBold">
                {accounts.length === 1 ? '1 linked account' : `${accounts.length} linked accounts`}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {accounts.length} of {MAX_ACCOUNTS}
              </ThemedText>
            </View>

            {accounts.map((account) => (
              <AccountCard key={account.id} account={account} onUnlinked={onChanged} />
            ))}

            {canAdd ? (
              <TwdButton
                label="Link another account"
                icon="plus"
                variant="secondary"
                onPress={promptLinkNotBuilt}
                accessibilityHint="Links another TWD water account to your profile"
              />
            ) : (
              <View
                style={[
                  styles.limitNote,
                  { borderColor: theme.warning, backgroundColor: theme.warningSurface },
                ]}
                accessible
                accessibilityRole="summary">
                <Icon name="info" size={20} color={theme.warning} />
                <ThemedText type="small" style={[styles.limitText, { color: theme.warning }]}>
                  You&apos;ve linked the maximum of {MAX_ACCOUNTS} accounts. Contact the TWD office
                  if you need more.
                </ThemedText>
              </View>
            )}
          </>
        )}
      </ScreenSection>
    </>
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
function AccountCard({ account, onUnlinked }: { account: Account; onUnlinked: () => void }) {
  const theme = useTwdTheme();
  const [busy, setBusy] = useState(false);

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
   * Unlink asks first, and says what is lost.
   *
   * It previously had no `onPress` at all — a red button that did nothing. Once
   * wired it is genuinely destructive: unlinking drops this account's billing
   * history from the consumer's view, and an outstanding balance does not go with
   * it. The bill stays owed whether or not it is visible, which is exactly the
   * misunderstanding a confirmation has to head off.
   */
  const confirmUnlink = () => {
    // An unknown balance warns too. Staying silent would imply "nothing owed" on
    // exactly the accounts we cannot vouch for.
    const balanceWarning = owes
      ? `This account still owes ${formatPeso(outstanding)}. Unlinking does not cancel the bill — it stays due, you just won't see it here.\n\n`
      : !known
        ? "This account may still have a balance. Unlinking does not cancel any bill — it stays due, you just won't see it here.\n\n"
        : '';

    Alert.alert(
      `Unlink ${account.accountNumber}?`,
      // Relinking is no longer self-service: the server refuses it (403) until the
      // district defines a verification workflow. Promising "you can link it again
      // with the account number from your bill" would be a lie that costs the
      // consumer a trip to the office to undo.
      `${balanceWarning}You'll lose access to this account's billing history in the app. ` +
        'Re-linking has to be done at the TWD office with a valid ID.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unlink',
          style: 'destructive',
          onPress: () => {
            setBusy(true);
            void unlinkAccount(account.accountNumber)
              .then(onUnlinked)
              .catch(() =>
                Alert.alert(
                  'Could not unlink',
                  'We couldn\'t reach TWD just now. The account is still linked — try again in a moment.',
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
        {/* 🏠 / 🏢 previously, at fontSize 24 — a different vendor's artwork on
            every OS, ignoring the theme, announced by screen readers as "house". */}
        <Icon name={account.type === 'commercial' ? 'building' : 'home'} size={24} color={theme.primary} />
        <View style={styles.cardHeaderText}>
          <ThemedText type="defaultBold" style={styles.cardTitle}>
            {account.accountNumber}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {account.type === 'commercial' ? 'Commercial' : 'Residential'}
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

      <TwdButton
        label="Unlink"
        variant="danger"
        busy={busy}
        busyLabel="Unlinking…"
        onPress={confirmUnlink}
        accessibilityHint={`Asks you to confirm before removing ${account.accountNumber} from your profile`}
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

/**
 * Linking is not built.
 *
 * POST /accounts/link exists and is Consumer-gated, so this is a form away — but a
 * form is a screen with validation, a not-found path, an already-linked path, and
 * the 409 the server returns at the 5-account cap. The old button was
 * `onPress={() => {}}`: a tap that did nothing at all, which is the one outcome
 * worse than saying so.
 */
function promptLinkNotBuilt() {
  Alert.alert(
    'Not available yet',
    'Linking an account from the app is coming soon. For now, visit the TWD office with a valid ID and your account number, and staff will link it for you.',
    [{ text: 'OK' }]
  );
}

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
