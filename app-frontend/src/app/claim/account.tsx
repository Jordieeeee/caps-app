import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth } from '@/constants/theme';
import { ScreenMessage } from '@/shared/components/screen-message';
import { StepProgress } from '@/shared/components/step-progress';
import { TwdButton } from '@/shared/components/twd-button';
import { TwdTextField } from '@/shared/components/twd-text-field';
import { useConnectivity } from '@/shared/hooks/use-connectivity';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import * as googleApi from '@/shared/services/google-api-client';
import { Radius, Spacing } from '@/shared/theme/twd';
import { ClaimErrorCode, GoogleFlowError } from '@/shared/types/google-auth';

/**
 * Claim step 1 — prove you hold a TWD account number.
 *
 * The backend owns every outcome distinction; this screen only maps its typed
 * error codes to titles and shows the backend's own generic message verbatim.
 * Nothing here invents wording that could reveal more than the server chose
 * to — that discipline is the whole point of the generic-message contract.
 */
export default function ClaimAccountScreen() {
  const router = useRouter();
  const theme = useTwdTheme();
  const { isOnline, recheck } = useConnectivity();

  const [accountNumber, setAccountNumber] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<GoogleFlowError | null>(null);

  const offline = isOnline === false;

  if (offline && !busy) {
    return (
      <ScreenMessage
        tone="warning"
        title="No connection"
        body="You need an internet connection to verify your account. Check your mobile data or Wi-Fi, then try again."
        action={{ label: 'Try again', onPress: () => void recheck() }}
      />
    );
  }

  function validate(): boolean {
    if (!accountNumber.trim()) {
      setFieldError('Enter the account number from your bill.');
      return false;
    }
    setFieldError(undefined);
    return true;
  }

  async function requestChallenge() {
    setFailure(null);
    if (!validate()) return;
    setBusy(true);
    try {
      const challenge = await googleApi.claimAccount(accountNumber);
      // Params carry the two facts step 2 needs to display and submit. The
      // account number is not secret and was already sent in plaintext.
      router.push({
        pathname: '/claim/verify',
        params: { accountNumber: accountNumber.trim(), maskedNumber: challenge.maskedNumber },
      });
    } catch (error) {
      setFailure(
        error instanceof GoogleFlowError
          ? error
          : new GoogleFlowError(ClaimErrorCode.SERVER, 'Something went wrong. Please try again.')
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <ThemedView style={styles.root}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView style={styles.flex}>
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag">
            <View style={[styles.content, { maxWidth: MaxContentWidth }]}>
              <StepProgress step={1} total={2} label="Account number" />

              <View style={styles.header}>
                <ThemedText type="subtitle" style={styles.centered}>
                  Verify your account
                </ThemedText>
                <ThemedText themeColor="textSecondary" style={styles.centered}>
                  Enter the account number printed on your TWD bill. We&apos;ll text a
                  verification code to the mobile number the office has on file.
                </ThemedText>
              </View>

              {failure && (
                <View
                  style={[
                    styles.banner,
                    { backgroundColor: theme.dangerSurface, borderColor: theme.danger },
                  ]}
                  accessibilityRole="alert"
                  accessibilityLiveRegion="assertive">
                  <ThemedText type="defaultBold" style={{ color: theme.danger }}>
                    {FAILURE_TITLES[failure.code]}
                  </ThemedText>
                  <ThemedText type="small" style={{ color: theme.danger }}>
                    {failure.message}
                  </ThemedText>
                </View>
              )}

              <TwdTextField
                label="Account number"
                value={accountNumber}
                onChangeText={(text) => {
                  setAccountNumber(text);
                  if (fieldError) setFieldError(undefined);
                }}
                error={fieldError}
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!busy}
                returnKeyType="go"
                onSubmitEditing={() => void requestChallenge()}
              />

              <TwdButton
                label="Send verification code"
                busyLabel="Sending…"
                busy={busy}
                onPress={() => void requestChallenge()}
                accessibilityHint="Sends a one-time code to the mobile number TWD has on record for this account"
              />
            </View>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

/** Titles keyed by machine code; bodies are always the backend's message.
 * RATE_LIMITED covers both the failure window and the resend cooldown — the
 * backend's message already says which. */
const FAILURE_TITLES: Record<ClaimErrorCode, string> = {
  [ClaimErrorCode.NOT_FOUND]: 'Account not found',
  [ClaimErrorCode.NO_MOBILE_ON_FILE]: 'No mobile number on file',
  [ClaimErrorCode.RATE_LIMITED]: 'Too many attempts',
  [ClaimErrorCode.SMS_DELIVERY_FAILED]: "Couldn't send the code",
  [ClaimErrorCode.OTP_INVALID]: 'Invalid request',
  [ClaimErrorCode.NETWORK]: 'Cannot reach TWD',
  [ClaimErrorCode.SERVER]: 'Something went wrong',
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center' },
  content: {
    width: '100%',
    alignSelf: 'center',
    padding: Spacing.four,
    gap: Spacing.four,
  },
  header: { alignItems: 'center', gap: Spacing.two },
  centered: { textAlign: 'center' },
  banner: {
    gap: Spacing.half,
    padding: Spacing.three,
    borderRadius: Radius.card,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
});
