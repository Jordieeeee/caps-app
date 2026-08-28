import { Image } from 'expo-image';
import { useCallback, useRef, useState } from 'react';
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
import { GoogleSignInPanel, OrDivider } from '@/shared/auth/google-sign-in-panel';
import { useGoogleSignIn } from '@/shared/auth/use-google-sign-in';
import { PasswordRevealToggle } from '@/shared/components/password-reveal-toggle';
import { ScreenMessage } from '@/shared/components/screen-message';
import { TwdButton } from '@/shared/components/twd-button';
import { TwdTextField } from '@/shared/components/twd-text-field';
import { useConnectivity } from '@/shared/hooks/use-connectivity';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { Radius, Spacing } from '@/shared/theme/twd';
import {
  AuthError,
  AuthErrorCode,
  ClientErrorCode,
  type SignedOutReason,
} from '@/shared/types/auth';
import type { GoogleSession } from '@/shared/types/google-auth';

/**
 * The single login screen, shared by both roles.
 *
 * There is no role selector and there is nothing here to add one to: the form
 * collects an email and a password, and the role arrives in the JWT the server
 * signs. The client never gets a say. Note that the enrolment link below is
 * labelled for consumers explicitly — pre-login we do not know who is typing, so
 * it must not read as a path staff could take.
 */
export function LoginScreen() {
  const { state, signIn, signInWithGoogle } = useAuth();
  const theme = useTwdTheme();
  const { isOnline, recheck } = useConnectivity();
  const passwordRef = useRef<TextInput>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordRevealed, setPasswordRevealed] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<{ code: string; message: string } | null>(null);

  // The Google half of this screen. Its failures are its own — they render in
  // the panel below the divider, never in the password form's error banner,
  // because a consumer whose Google sheet timed out has not failed to sign in
  // with a password and must not be told they did.
  const google = useGoogleSignIn(
    useCallback(
      (session: GoogleSession) => {
        void signInWithGoogle(session).catch(() => {
          // adoptGoogleSession only throws after clearing a bad credential;
          // the listener has already forced sign-out. Nothing to surface here
          // that the resulting signed-out state doesn't already say.
        });
      },
      [signInWithGoogle]
    )
  );

  const busy = state.status === 'authenticating';
  const offline = isOnline === false;

  const reason: SignedOutReason =
    state.status === 'signedOut' ? state.reason : { kind: 'initial' };

  // Section 4: no connectivity + no live session. This is a blocking state with a
  // retry, not a toast — a consumer needs to understand the app is not broken and
  // they are not locked out; they simply have no signal.
  if (offline && !busy) {
    return (
      <ScreenMessage
        tone="warning"
        title="No connection"
        body="You need an internet connection to sign in. Check your mobile data or Wi-Fi, then try again."
        // Re-probes the network rather than resubmitting the form: there are no
        // credentials to submit yet, since the form is not on screen.
        action={{ label: 'Try again', onPress: () => void recheck() }}
      />
    );
  }

  function validate(): boolean {
    const next: { email?: string; password?: string } = {};
    if (!email.trim()) next.email = 'Enter your email address.';
    else if (!/^\S+@\S+\.\S+$/.test(email.trim())) next.email = 'Enter a valid email address.';
    if (!password) next.password = 'Enter your password.';
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function attemptSignIn() {
    setFormError(null);
    if (!validate()) return;

    try {
      await signIn(email, password);
      // On success the root layout's guards swap the navigator for us — this
      // screen simply unmounts. Nothing to navigate to by hand.
    } catch (error) {
      const code = error instanceof AuthError ? error.code : ClientErrorCode.UNKNOWN;
      const message =
        error instanceof Error ? error.message : 'Something went wrong. Please try again.';
      setFormError({ code, message });
      if (code === AuthErrorCode.INVALID_CREDENTIALS) {
        setPassword('');
        // Re-mask on a rejected attempt. The cleared field is about to be retyped,
        // and inheriting "revealed" from the previous try would put the retyped
        // password on screen without the user having asked for it again.
        setPasswordRevealed(false);
      }
    }
  }

  // Account disabled is a full explanation, not an inline hint: it is not
  // something the user can fix by retyping, so offering them the form again
  // would be misleading.
  if (formError?.code === AuthErrorCode.ACCOUNT_DISABLED) {
    return (
      <ScreenMessage
        tone="danger"
        title="Account deactivated"
        body={formError.message}
        action={{ label: 'Back to sign in', onPress: () => setFormError(null) }}
      />
    );
  }

  if (formError?.code === ClientErrorCode.ROLE_UNSUPPORTED) {
    return (
      <ScreenMessage
        tone="warning"
        title="Use the Admin Portal"
        body={formError.message}
        action={{ label: 'Back to sign in', onPress: () => setFormError(null) }}
      />
    );
  }

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
            <View style={styles.content}>
              <View style={styles.header}>
                <Image
                  source={require('@/assets/images/icon.png')}
                  style={styles.logo}
                  contentFit="contain"
                  accessibilityIgnoresInvertColors
                  accessibilityLabel="Tanauan City Water District seal"
                />
                <ThemedText type="subtitle" style={styles.centered}>
                  Tanauan City{'\n'}Water District
                </ThemedText>
                <ThemedText themeColor="textSecondary" style={styles.centered}>
                  Sign in to your account
                </ThemedText>
              </View>

              <SignedOutNotice reason={reason} />

              {formError && (
                <View
                  style={[
                    styles.formError,
                    { backgroundColor: theme.dangerSurface, borderColor: theme.danger },
                  ]}
                  accessibilityRole="alert"
                  accessibilityLiveRegion="assertive">
                  <ThemedText type="defaultBold" style={{ color: theme.danger }}>
                    {formError.code === ClientErrorCode.NETWORK_UNAVAILABLE
                      ? 'Cannot reach TWD'
                      : 'Sign in failed'}
                  </ThemedText>
                  <ThemedText type="small" style={{ color: theme.danger }}>
                    {formError.message}
                  </ThemedText>
                </View>
              )}

              <View style={styles.form}>
                <TwdTextField
                  label="Email address"
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text);
                    if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: undefined }));
                  }}
                  error={fieldErrors.email}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  editable={!busy}
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  submitBehavior="submit"
                />

                <TwdTextField
                  ref={passwordRef}
                  label="Password"
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    if (fieldErrors.password) setFieldErrors((p) => ({ ...p, password: undefined }));
                  }}
                  error={fieldErrors.password}
                  secureTextEntry={!passwordRevealed}
                  autoCapitalize="none"
                  autoCorrect={false}
                  // Off for the revealed path: iOS and Android both refuse to
                  // autofill a field that isn't masked, and leaving it on makes the
                  // keyboard offer suggestions over a visible password.
                  autoComplete={passwordRevealed ? 'off' : 'current-password'}
                  textContentType={passwordRevealed ? 'none' : 'password'}
                  editable={!busy}
                  returnKeyType="go"
                  onSubmitEditing={() => void attemptSignIn()}
                  trailingAccessory={
                    <PasswordRevealToggle
                      revealed={passwordRevealed}
                      onToggle={() => setPasswordRevealed((v) => !v)}
                      disabled={busy}
                    />
                  }
                />

                {/* "Forgot your password?" was here, and its removal is a product
                    decision rather than a tidy-up — recorded here because the next
                    person to read this screen will wonder where it went.

                    There is no reset endpoint and, given how accounts are actually
                    created, there is nothing to build one for: every credential in
                    the district's database is either portal-issued (reset at the
                    office, by design — this backend is read-only against
                    `appcredentials`), a Google identity (recovers by signing in
                    with Google, then Account → Password), or a seeded dev account.
                    Self-registration, the one bucket that would need a real reset
                    flow, is switched off — see the note further down this file —
                    and has produced zero accounts.

                    ⚠️ IF /enroll IS EVER RE-LINKED, THIS COMES BACK WITH IT. A
                    self-registered consumer has no Google account and no office
                    record, so they would have no recovery path at all — not even a
                    counter to walk into. Re-enabling self-registration and building
                    password recovery are one decision, not two.

                    The route file at app/(auth)/forgot-password.tsx is left in
                    place, unlinked, exactly as /enroll is. */}

                <TwdButton
                  label="Sign in"
                  busyLabel="Signing in…"
                  busy={busy}
                  onPress={() => void attemptSignIn()}
                  style={styles.submit}
                  accessibilityHint="Signs you in to your Tanauan City Water District account"
                />
              </View>

              {/* Google sits BELOW the password form, deliberately.

                  Collectors sign in here every shift with a password, and
                  putting a second primary-weight control above the one they
                  came for would tax the daily user to help the occasional one.
                  Consumers arriving for Google are reading the screen rather
                  than pattern-matching to a remembered position, so they find
                  it; the labelled divider is what tells them the two are
                  alternatives and not steps.

                  Rendered only where it can actually work — googleAuthConfig()
                  returns null on web, and a button that opens nothing is worse
                  than no button. */}
              {google.configured && (
                <View style={styles.googleSection}>
                  <OrDivider />
                  <GoogleSignInPanel controller={google} disabled={busy} />
                </View>
              )}

              {/* Section 3: who this password form is FOR, and nothing else.

                  Self-enrolment used to live here ("Are you a water district
                  customer without an account?" + a link to /enroll). It is gone
                  deliberately, not tidied away: POST /auth/register creates a
                  password Consumer with no ConsumerLink, and models/ConsumerLink.js
                  calls that link "the sole path every consumer-facing billing
                  endpoint must consult". So a self-enrolled account signed in
                  perfectly and showed ZERO bills, with no way from inside the app
                  to attach it to a meter. Consumers reach their account through
                  Continue with Google + the OTP claim, which is the only flow that
                  mints a link.

                  The staff line stays, and matters more now than it did. With the
                  enrolment link gone this is the only thing on the screen that
                  explains who the password fields are for — collectors every shift,
                  and office-issued consumer accounts. Without it the form reads as
                  an orphan above the Google button. */}

            </View>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

/**
 * Explains why the user is looking at a login form. Section 4 is explicit that an
 * expired session must be explained rather than silently redirected — someone who
 * was working a moment ago deserves to know what changed.
 */
function SignedOutNotice({ reason }: { reason: SignedOutReason }) {
  const theme = useTwdTheme();

  const notice = (() => {
    switch (reason.kind) {
      case 'session-expired':
        return {
          title: 'Your session has expired',
          body: 'For your security, sessions end after a period of inactivity. Please sign in again to continue.',
        };
      case 'account-disabled':
        return {
          title: 'Account deactivated',
          body: 'This account is no longer active. Please contact the Tanauan City Water District office.',
        };
      case 'role-unsupported':
        return {
          title: 'Use the Admin Portal',
          body: `${reason.role} accounts do not have a mobile app. Please sign in through the TWD Admin Portal.`,
        };
      case 'signed-out':
        return { title: 'Signed out', body: 'You have been signed out. Sign in again to continue.' };
      case 'initial':
      default:
        return null;
    }
  })();

  if (!notice) return null;

  return (
    <View
      style={[
        styles.notice,
        { backgroundColor: theme.warningSurface, borderColor: theme.warning },
      ]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite">
      <ThemedText type="defaultBold" style={{ color: theme.warning }}>
        {notice.title}
      </ThemedText>
      <ThemedText type="small" style={{ color: theme.warning }}>
        {notice.body}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
  },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: Spacing.four,
  },
  header: {
    alignItems: 'center',
    gap: Spacing.two,
    marginBottom: Spacing.two,
  },
  logo: {
    width: 96,
    height: 96,
  },
  centered: { textAlign: 'center' },
  form: { gap: Spacing.three },
  submit: { marginTop: Spacing.two },
  googleSection: { gap: Spacing.three },
  notice: {
    gap: Spacing.half,
    padding: Spacing.three,
    borderRadius: Radius.card,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  formError: {
    gap: Spacing.half,
    padding: Spacing.three,
    borderRadius: Radius.card,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
});
