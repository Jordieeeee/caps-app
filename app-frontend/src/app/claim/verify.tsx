import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth } from '@/constants/theme';
import { useAuth } from '@/shared/auth/auth-context';
import { TwdButton } from '@/shared/components/twd-button';
import { TwdLink } from '@/shared/components/twd-link';
import { StepProgress } from '@/shared/components/step-progress';
import { TwdTextField } from '@/shared/components/twd-text-field';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import * as googleApi from '@/shared/services/google-api-client';
import { Radius, Spacing } from '@/shared/theme/twd';
import { ClaimErrorCode, GoogleFlowError } from '@/shared/types/google-auth';

/** How long the resend control stays disabled after each send. Mirrors the
 * backend's cooldown; the backend remains the authority — a client that
 * enables early just gets the 429 wording. */
const RESEND_COOLDOWN_SECONDS = 60;

/**
 * Claim step 2 — enter the code that arrived by SMS.
 *
 * Failure handling per spec: wrong/expired code shows ONE generic message
 * (the backend refuses to distinguish them and so does this screen) and lets
 * the user retry immediately. Resend is a real re-request of step 1 with a
 * visible countdown; enabling it early is harmless — the server answers 429.
 *
 * On success there is deliberately no navigation call: updateGoogleRole swaps
 * the session role, the root guards drop this subtree from history, and the
 * consumer area admits the user. One mechanism owns routing; screens never
 * race it.
 */
export default function VerifyClaimScreen() {
  const router = useRouter();
  const theme = useTwdTheme();
  const { updateGoogleRole } = useAuth();
  const codeRef = useRef<TextInput>(null);

  // Deep-link safety: arriving here without step-1 params has no way to make a
  // valid submission, so go back to the start of the flow.
  const params = useLocalSearchParams<{ accountNumber?: string; maskedNumber?: string }>();
  const accountNumber = typeof params.accountNumber === 'string' ? params.accountNumber : '';
  const maskedNumber = typeof params.maskedNumber === 'string' ? params.maskedNumber : '';

  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<GoogleFlowError | null>(null);
  const [resent, setResent] = useState(false);

  /** Cooldown as an absolute deadline + 1s tick — immune to double-intervals. */
  const [resendAllowedAt, setResendAllowedAt] = useState(() => Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    if (nowTick >= resendAllowedAt) return;
    const t = setTimeout(() => setNowTick(Date.now()), 1000);
    return () => clearTimeout(t);
  }, [nowTick, resendAllowedAt]);
  const secondsLeft = Math.max(0, Math.ceil((resendAllowedAt - nowTick) / 1000));

  useEffect(() => {
    if (!accountNumber) {
      router.replace('/claim/account');
    }
  }, [accountNumber, router]);

  /**
   * Open the keyboard on arrival — the only thing this screen wants is six
   * digits, and making the user find the field first is a tap that buys
   * nothing.
   *
   * Deferred rather than `autoFocus`: focusing while the push animation is
   * still running gets dropped on Android often enough to be a real bug, and
   * the failure mode (a screen that quietly never raises the keyboard) is
   * exactly the kind of thing nobody reports. One frame after the transition
   * settles is reliable on both platforms.
   */
  useEffect(() => {
    const t = setTimeout(() => codeRef.current?.focus(), 350);
    return () => clearTimeout(t);
  }, []);

  /**
   * Takes the code as an argument rather than reading `code` off state,
   * because auto-submit calls this from inside onChangeText — one render
   * before the state holds the sixth digit. Reading state there would submit
   * five digits and fail every time.
   */
  async function attemptVerify(submitted: string) {
    if (busy) return;
    setFailure(null);
    setResent(false);
    setBusy(true);
    try {
      const session = await googleApi.verifyClaimCode(accountNumber, submitted);
      // Store + context move together inside the context method. When it
      // resolves, guards have already flipped and this screen is being
      // dropped from history.
      await updateGoogleRole(session);
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

  async function resendCode() {
    setFailure(null);
    setResent(false);
    try {
      await googleApi.claimAccount(accountNumber);
      // New challenge issued (and any prior one superseded server-side).
      setCode('');
      setResendAllowedAt(Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
      setNowTick(Date.now());
      setResent(true);
    } catch (error) {
      if (error instanceof GoogleFlowError && error.code === ClaimErrorCode.RATE_LIMITED) {
        // Still cooling down server-side: restart the visible timer to match
        // reality instead of letting the button flap open every second.
        setResendAllowedAt(Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
        setNowTick(Date.now());
      }
      setFailure(
        error instanceof GoogleFlowError
          ? error
          : new GoogleFlowError(ClaimErrorCode.SERVER, 'Something went wrong. Please try again.')
      );
    }
  }

  /**
   * `back()` when there is history — the normal push from step 1 — and a
   * replace otherwise, because a deep link straight to /claim/verify has
   * nothing to pop and back() would strand the user on this screen.
   */
  const goBackToAccount = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/claim/account');
  };

  const submitReady = /^\d{6}$/.test(code);

  return (
    <ThemedView style={styles.root}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView style={styles.flex}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag">
            <View style={[styles.content, { maxWidth: MaxContentWidth }]}>
              <StepProgress step={2} total={2} label="Verification code" />

              <View style={styles.header}>
                <ThemedText type="subtitle" style={styles.centered}>
                  Enter your code
                </ThemedText>
                {/*
                  The number gets its own line at its own weight instead of
                  sitting mid-sentence in grey. It answers the one question
                  this screen creates — "which phone do I go and unlock?" —
                  and for someone holding two SIMs, buried in a paragraph is
                  the same as absent. Falls back to the generic wording when
                  step 1's param didn't come through; the sentence still
                  reads.
                */}
                <ThemedText themeColor="textSecondary" style={styles.centered}>
                  {maskedNumber
                    ? 'We sent a 6-digit code by text to'
                    : 'We sent a 6-digit code by text to the mobile number on file.'}
                </ThemedText>
                {maskedNumber ? (
                  <ThemedText type="subtitle" style={styles.centered}>
                    {maskedNumber}
                  </ThemedText>
                ) : null}
                <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
                  It expires in 5 minutes.
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

              {!failure && resent && (
                <View
                  style={[styles.banner, styles.infoBanner]}
                  accessibilityRole="text">
                  <ThemedText type="small" themeColor="textSecondary">
                    A new code was sent.
                  </ThemedText>
                </View>
              )}

              <View style={styles.form}>
                <TwdTextField
                  ref={codeRef}
                  label="Verification code"
                  value={code}
                  onChangeText={(text) => {
                    // Digits only, hard-capped at six — pasting a whole SMS
                    // should not need manual cleanup.
                    const next = text.replace(/\D/g, '').slice(0, 6);
                    setCode(next);
                    setResent(false);
                    // Auto-advance: the sixth digit IS the submit. Fired from
                    // the change event and gated on the code actually growing,
                    // never from an effect watching `code.length` — after a
                    // failed attempt the field still holds six digits, so a
                    // length-watching effect would resubmit forever. Growth
                    // means the user just typed or pasted; a correction that
                    // shortens then re-lengthens submits once, deliberately.
                    if (next.length === 6 && code.length < 6) {
                      void attemptVerify(next);
                    }
                  }}
                  keyboardType="number-pad"
                  autoComplete="sms-otp"
                  textContentType="oneTimeCode"
                  editable={!busy}
                  returnKeyType="go"
                  onSubmitEditing={() => {
                    if (submitReady) void attemptVerify(code);
                  }}
                />

                <TwdButton
                  label="Verify"
                  busyLabel="Verifying…"
                  busy={busy}
                  disabled={!submitReady}
                  onPress={() => void attemptVerify(code)}
                  accessibilityHint="Checks your code and finishes claiming your account"
                />

                {/* Resend re-runs claim-account for the same number. Disabled
                    during the cooldown with a live count; the server remains
                    the authority on timing. */}
                {secondsLeft > 0 ? (
                  <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
                    You can request another code in {secondsLeft}s.
                  </ThemedText>
                ) : (
                  <TwdLink
                    label="Send a new code"
                    onPress={() => void resendCode()}
                    disabled={busy}
                    accessibilityHint="Sends a fresh verification code to the same mobile number"
                    style={styles.resend}
                  />
                )}

                {/* Cancel returns to step 1, where the account number can be
                    corrected — which is the whole reason this screen needed a
                    way out. Without it someone who mistyped their account
                    number was stranded waiting for a code being texted to a
                    phone that isn't theirs, and resending could never fix it.

                    `secondary` so it sits under the filled Verify button as
                    the escape route, not a competing action. Returning issues a
                    FRESH code on resubmit and the server's cooldown still
                    applies, so a fast round trip can hit RATE_LIMITED — said in
                    the hint rather than left to be discovered. */}
                <TwdButton
                  label="Cancel"
                  variant="secondary"
                  disabled={busy}
                  onPress={goBackToAccount}
                  accessibilityHint="Returns to step 1 so you can correct your account number. A new code will be sent."
                />
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const FAILURE_TITLES: Record<ClaimErrorCode, string> = {
  [ClaimErrorCode.NOT_FOUND]: 'Account not found',
  [ClaimErrorCode.NO_MOBILE_ON_FILE]: 'No mobile number on file',
  [ClaimErrorCode.RATE_LIMITED]: 'Too many attempts',
  [ClaimErrorCode.SMS_DELIVERY_FAILED]: "Couldn't send the code",
  [ClaimErrorCode.OTP_INVALID]: 'Incorrect or expired code',
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
  infoBanner: { alignItems: 'center' },
  form: { gap: Spacing.three },
  resend: { alignSelf: 'center' },
});
