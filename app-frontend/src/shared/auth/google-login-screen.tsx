import { Image } from 'expo-image';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth } from '@/constants/theme';
import { GoogleSignInPanel } from '@/shared/auth/google-sign-in-panel';
import { useGoogleSignIn } from '@/shared/auth/use-google-sign-in';
import { Spacing } from '@/shared/theme/twd';
import { type GoogleSession } from '@/shared/types/google-auth';

/**
 * Google-only sign-in screen, at /google-login.
 *
 * NOT the app's landing screen — index.tsx sends signed-out users to /login,
 * which carries the password form with the same Google button beneath it.
 * This route survives as the direct link (support telling a consumer "open
 * this and tap the Google button", a QR on a bill) and as the screen to
 * promote if the password form is ever retired.
 *
 * The flow itself lives in useGoogleSignIn and the control in
 * GoogleSignInPanel, shared with /login — see the hook's header for why the
 * OAuth logic is not duplicated per screen.
 */
export function GoogleLoginScreen({
  onSuccess,
}: {
  onSuccess?: (session: GoogleSession) => void;
}) {
  const google = useGoogleSignIn(onSuccess);

  if (!google.configured) {
    return (
      <ThemedView style={styles.root}>
        <View style={styles.centeredBox}>
          <ThemedText type="subtitle" style={styles.centered}>
            Sign in on your phone
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.centered}>
            Google sign-in is available in the Tanauan City Water District mobile app for iOS and
            Android.
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.root}>
      <SafeAreaView style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={[styles.content, { maxWidth: MaxContentWidth }]}>
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
                Sign in with your Google account
              </ThemedText>
            </View>

            <GoogleSignInPanel controller={google} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

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
  logo: { width: 96, height: 96 },
  centered: { textAlign: 'center' },
  centeredBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
});
