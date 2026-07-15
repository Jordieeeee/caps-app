import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth } from '@/constants/theme';
import { useAuth } from '@/shared/auth/auth-context';
import { ScreenMessage } from '@/shared/components/screen-message';
import { TwdButton } from '@/shared/components/twd-button';
import { TwdTextField } from '@/shared/components/twd-text-field';
import { useConnectivity } from '@/shared/hooks/use-connectivity';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { Radius, Spacing } from '@/shared/theme/twd';
import { AuthError, ClientErrorCode } from '@/shared/types/auth';

const MIN_PASSWORD_LENGTH = 8;

/**
 * Consumer account enrolment.
 *
 * Consumer-only by construction, not by convention: this posts to /auth/register,
 * which now always creates a Consumer regardless of what the client sends. There
 * is no role field on this form because there is no role field on that endpoint.
 *
 * Linking an actual water account to the new login is a separate flow — consumers
 * may link several up to a cap, so it does not belong in a screen that creates one
 * login.
 */
export function EnrollScreen() {
  const { state, enroll } = useAuth();
  const router = useRouter();
  const theme = useTwdTheme();
  const { isOnline, recheck } = useConnectivity();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);

  const busy = state.status === 'authenticating';

  if (isOnline === false && !busy) {
    return (
      <ScreenMessage
        tone="warning"
        title="No connection"
        body="You need an internet connection to enroll. Check your mobile data or Wi-Fi, then try again."
        action={{ label: 'Try again', onPress: () => void recheck() }}
        secondaryAction={{ label: 'Back to sign in', onPress: () => router.back() }}
      />
    );
  }

  function validate(): boolean {
    const next: typeof errors = {};
    if (!name.trim()) next.name = 'Enter your full name.';
    if (!email.trim()) next.email = 'Enter your email address.';
    else if (!/^\S+@\S+\.\S+$/.test(email.trim())) next.email = 'Enter a valid email address.';
    if (password.length < MIN_PASSWORD_LENGTH) {
      next.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit() {
    setFormError(null);
    if (!validate()) return;
    try {
      await enroll(name, email, password);
    } catch (error) {
      const code = error instanceof AuthError ? error.code : ClientErrorCode.UNKNOWN;
      setFormError(
        code === ClientErrorCode.NETWORK_UNAVAILABLE
          ? 'Cannot reach the TWD server. Check your connection and try again.'
          : error instanceof Error
            ? error.message
            : 'Could not create your account. Please try again.'
      );
    }
  }

  return (
    <ThemedView style={styles.root}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView style={styles.flex}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <View style={styles.content}>
              <View style={styles.header}>
                <ThemedText type="subtitle" style={styles.centered}>
                  Enroll a consumer account
                </ThemedText>
                <ThemedText themeColor="textSecondary" style={styles.centered}>
                  For Tanauan City Water District customers. You can link your water
                  account numbers after signing in.
                </ThemedText>
              </View>

              {formError && (
                <View
                  style={[
                    styles.formError,
                    { backgroundColor: theme.dangerSurface, borderColor: theme.danger },
                  ]}
                  accessibilityRole="alert"
                  accessibilityLiveRegion="assertive">
                  <ThemedText type="small" style={{ color: theme.danger }}>
                    {formError}
                  </ThemedText>
                </View>
              )}

              <View style={styles.form}>
                <TwdTextField
                  label="Full name"
                  value={name}
                  onChangeText={setName}
                  error={errors.name}
                  autoComplete="name"
                  textContentType="name"
                  editable={!busy}
                />
                <TwdTextField
                  label="Email address"
                  value={email}
                  onChangeText={setEmail}
                  error={errors.email}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  editable={!busy}
                />
                <TwdTextField
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  error={errors.password}
                  hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="new-password"
                  textContentType="newPassword"
                  editable={!busy}
                />

                <TwdButton
                  label="Create account"
                  busyLabel="Creating account…"
                  busy={busy}
                  onPress={() => void submit()}
                  style={styles.submit}
                />
                <TwdButton
                  label="Back to sign in"
                  variant="secondary"
                  onPress={() => router.back()}
                  disabled={busy}
                />
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </ThemedView>
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
  content: { width: '100%', maxWidth: MaxContentWidth, gap: Spacing.four },
  header: { alignItems: 'center', gap: Spacing.two },
  centered: { textAlign: 'center' },
  form: { gap: Spacing.three },
  submit: { marginTop: Spacing.two },
  formError: {
    padding: Spacing.three,
    borderRadius: Radius.card,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
});
