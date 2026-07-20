import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MAX_ACCOUNTS } from '@/consumer/types';
import { listAccounts, unlinkAccount, type Account } from '@/consumer/services/consumer-data';
import { useAuth, useSession } from '@/shared/auth/auth-context';
import { Icon, type IconName } from '@/shared/components/icon';
import { ListEmpty, ListError, ListLoading } from '@/shared/components/list-states';
import { ScreenContainer, ScreenSection } from '@/shared/components/screen-container';
import { ScreenHeader } from '@/shared/components/screen-header';
import { AccountStatusBadge } from '@/shared/components/status-badge';
import { TwdButton } from '@/shared/components/twd-button';
import { formatPeso } from '@/shared/format/currency';
import { useAsync } from '@/shared/hooks/use-async';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { MIN_TAP_TARGET, Radius, Spacing } from '@/shared/theme/twd';

/**
 * Account — linked water accounts, plus the things you do once and forget.
 *
 * Sign out lives here now. It was the only button on Home: a consumer's landing
 * screen offered them exactly one action, and it was leaving. It also fired
 * immediately on tap. Feedback moved in too — see consumer-tabs.tsx for why it
 * did not deserve a tab of its own.
 */
export default function ConsumerAccountScreen() {
  // Bills are no longer fetched here. This screen used to pull the full bill list
  // purely to filter it per account for the balance row; the server now sends
  // `outstanding` on each account, so that request was a round trip whose result
  // could not be used against real data anyway.
  const load = useCallback(async () => ({ accounts: await listAccounts() }), []);
  const { state, reload } = useAsync(load);

  return (
    <ScreenContainer>
      <ScreenHeader title="Account" subtitle="Your linked water accounts and settings" />

      {state.status === 'loading' && (
        <ScreenSection>
          <ListLoading label="Loading your accounts…" />
        </ScreenSection>
      )}

      {state.status === 'error' && (
        <ScreenSection>
          <ListError
            title="Could not load your accounts"
            body="We couldn't reach Tanauan City Water District just now. Check your connection and try again."
            onRetry={reload}
          />
        </ScreenSection>
      )}

      {state.status === 'ready' && (
        <AccountBody accounts={state.data.accounts} onChanged={reload} />
      )}
    </ScreenContainer>
  );
}

function AccountBody({ accounts, onChanged }: { accounts: Account[]; onChanged: () => void }) {
  const theme = useTwdTheme();
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

      <SettingsSection />
    </>
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
  const { session } = useSession();
  const router = useRouter();

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

  return (
    <ScreenSection gap={Spacing.three}>
      <View style={styles.profileCard}>
        <ThemedText type="defaultBold">{session.user.name}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {session.user.email}
        </ThemedText>
      </View>

      <NavRow
        icon="message-square"
        label="Send feedback"
        detail="Report an issue"
        onPress={() => router.push('/consumer/account/feedback')}
      />

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
  );
}

function NavRow({
  icon,
  label,
  detail,
  onPress,
}: {
  icon: IconName;
  label: string;
  detail?: string;
  onPress: () => void;
}) {
  const theme = useTwdTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={detail ? `${label}. ${detail}` : label}
      style={({ pressed }) => [
        styles.navRow,
        {
          borderColor: theme.border,
          backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
        },
      ]}>
      <Icon name={icon} size={22} color={theme.textSecondary} />
      <ThemedText type="defaultBold" style={styles.navLabel}>
        {label}
      </ThemedText>
      <Icon name="chevron-right" size={20} color={theme.textSecondary} />
    </Pressable>
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
  profileCard: { gap: Spacing.one },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: MIN_TAP_TARGET,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.card,
    borderWidth: 2,
  },
  navLabel: { flex: 1 },
  footer: { textAlign: 'center', marginTop: Spacing.two },
});
