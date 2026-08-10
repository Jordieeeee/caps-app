import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { requestAccountLink } from '@/consumer/services/consumer-data';
import { Icon } from '@/shared/components/icon';
import { ScreenContainer, ScreenSection } from '@/shared/components/screen-container';
import { TwdButton } from '@/shared/components/twd-button';
import { TwdTextField } from '@/shared/components/twd-text-field';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { Radius, Spacing } from '@/shared/theme/twd';

/**
 * Request that TWD add a water account to this profile.
 *
 * ⚠️ THIS SCREEN DOES NOT LINK AN ACCOUNT, and every word on it is chosen so that
 * nobody could think otherwise. It sends a message to the district office; staff
 * check who the person is and make the link in the Admin Portal; the account then
 * turns up on the Account tab by itself. The submit button says "Send request" and
 * the success card says TWD has the request — never "linked", never "added".
 *
 * That gap is not a limitation to design around, it is the feature. Self-service
 * linking used to exist and attached any account number the caller typed, with no
 * ownership check; account numbers are sequential and printed on every bill posted
 * through a door, so it handed over the district's whole customer base to anyone
 * with a login. The check that replaced it is a human looking at an ID.
 *
 * The same reasoning shapes what this screen may say back. The server answers every
 * request identically whether the account exists, belongs to a stranger, or is a
 * typo — so there is no "account found" state here, and no validation that the
 * number is real. Anything more helpful would be the enumeration hole again, wearing
 * a friendlier hat.
 */
export default function ConsumerLinkAccountScreen() {
  const theme = useTwdTheme();
  const router = useRouter();

  const [accountNumber, setAccountNumber] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    const trimmed = accountNumber.trim().toUpperCase();

    /**
     * Shape only, mirroring the server's own check so an obvious slip costs no round
     * trip. It deliberately does not test the number against the district's
     * numbering scheme: the app would then be the reason a consumer could not ask
     * about a real account issued under a scheme this build predates.
     */
    if (!trimmed) {
      setError('Enter the account number printed on your TWD bill.');
      return;
    }
    if (!/^[A-Z0-9][A-Z0-9-]{3,31}$/.test(trimmed)) {
      setError(
        'That does not look like an account number. Enter it exactly as printed on your bill, for example ACC-2026-0001.'
      );
      return;
    }

    setSending(true);
    setError(null);
    try {
      const request = await requestAccountLink({
        accountNumber: trimmed,
        note: note.trim() || undefined,
      });
      setSent(request.accountNumber);
    } catch (e) {
      setSending(false);
      /**
       * The server's message, as-is. It is the side that refused, and the two
       * refusals it makes are both about the caller's own profile in words they can
       * act on — the account is already theirs, or they have too many requests open.
       */
      setError(
        e instanceof Error
          ? e.message
          : "We couldn't send your request just now. Check your connection and try again."
      );
    }
  };

  if (sent) {
    return (
      <ScreenContainer variant="stack">
        <ScreenSection gap={Spacing.three}>
          <View
            style={[styles.sentCard, { borderColor: theme.success }]}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite">
            <Icon name="check" size={32} color={theme.success} />
            <ThemedText type="defaultBold" style={styles.centered}>
              Request sent to TWD
            </ThemedText>
            {/* Says what happens next and what has *not* happened. A consumer who
                reads this as "done" will wait for a bill that never arrives. */}
            <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
              TWD has your request for {sent}. Staff will check your records before adding
              it — this can take a few working days, and they may ask you to come in with
              a valid ID. The account is not on your profile yet; it will appear on this
              tab once they have added it.
            </ThemedText>
          </View>

          <TwdButton label="Done" onPress={() => router.back()} />
        </ScreenSection>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer variant="stack">
      <ScreenSection gap={Spacing.three}>
        <ThemedText type="defaultBold">Which account?</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          The account number is printed at the top of your TWD bill. It looks like
          ACC-2026-0001.
        </ThemedText>

        <TwdTextField
          label="Account number"
          value={accountNumber}
          onChangeText={(t) => {
            setAccountNumber(t);
            if (error) setError(null);
          }}
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!sending}
        />

        <TwdTextField
          label="Anything TWD should know? (optional)"
          value={note}
          onChangeText={(t) => {
            setNote(t);
            if (error) setError(null);
          }}
          multiline
          numberOfLines={3}
          editable={!sending}
          hint="For example, if the bill is in a relative's name."
        />
      </ScreenSection>

      <ScreenSection gap={Spacing.three}>
        {error && (
          <View
            style={[
              styles.error,
              { borderColor: theme.danger, backgroundColor: theme.dangerSurface },
            ]}
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive">
            <Icon name="alert-triangle" size={18} color={theme.danger} />
            <ThemedText type="small" style={[styles.errorText, { color: theme.danger }]}>
              {error}
            </ThemedText>
          </View>
        )}

        {/* "Send request", not "Link account". The button names what the tap does. */}
        <TwdButton
          label="Send request"
          busy={sending}
          busyLabel="Sending…"
          onPress={() => void send()}
        />

        <View style={[styles.note, { borderColor: theme.border }]} accessible accessibilityRole="summary">
          <Icon name="info" size={20} color={theme.textSecondary} />
          <ThemedText type="small" themeColor="textSecondary" style={styles.noteText}>
            TWD staff add accounts by hand, after checking who you are. Sending this does
            not add the account, and you may be asked to visit the district office with a
            valid ID.
          </ThemedText>
        </View>
      </ScreenSection>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  sentCard: {
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.four,
    borderRadius: Radius.card,
    borderWidth: 2,
  },
  centered: { textAlign: 'center' },
  error: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.card,
    borderWidth: 2,
  },
  errorText: { flex: 1 },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.card,
    borderWidth: 2,
  },
  noteText: { flex: 1, lineHeight: 20 },
});
