import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AuthProvider, useAuth } from '@/shared/auth/auth-context';
import { ScreenLoading } from '@/shared/components/screen-message';

SplashScreen.preventAutoHideAsync();

/**
 * Root navigator and the single RBAC route decision point.
 *
 * The guards below are the whole mechanism. `role` comes from the decoded JWT
 * (see session-restore.ts and auth-context's `adopt`), never from anything the
 * user tapped — there is no code path that sets it any other way, which is what
 * makes a role toggle impossible to add by accident rather than merely absent.
 *
 * Guards are declarative on purpose: when one flips, Expo Router doesn't just hide
 * the route, it drops that route's history entries. So a collector's screens are
 * never left sitting in the back stack of a consumer session.
 *
 * This is client-side routing and it is NOT a security boundary. The server
 * enforces the same split on every request (app-backend/middleware/auth.js,
 * `requireRole`). This decides what to draw; that decides what is permitted.
 */
function RootNavigator() {
  const { state } = useAuth();

  const signedIn = state.status === 'signedIn';
  const role = signedIn ? state.role : null;

  // Reading the keychain is fast but not instant. Showing the loading state
  // rather than the login form matters: a collector who is already signed in must
  // never see a sign-in form flash past on a cold start and think they've been
  // logged out.
  if (state.status === 'restoring') {
    return <ScreenLoading label="Restoring your session…" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>

      <Stack.Protected guard={role === 'Collector'}>
        <Stack.Screen name="collector" />
      </Stack.Protected>

      <Stack.Protected guard={role === 'Consumer'}>
        <Stack.Screen name="consumer" />
      </Stack.Protected>

      <Stack.Screen name="index" />
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </ThemeProvider>
  );
}
