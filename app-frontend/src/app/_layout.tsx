import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as WebBrowser from 'expo-web-browser';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AuthProvider, useAuth } from '@/shared/auth/auth-context';
import { ScreenLoading } from '@/shared/components/screen-message';
import {
  ThemePreferenceProvider,
  useResolvedScheme,
} from '@/shared/theme/theme-preference';

// Must run exactly once at module scope, before ANY auth screen can mount: on
// web it is the piece that closes the auth popup when Google redirects back to
// this page, so a login screen mounting first would hang the redirect forever.
// On native it is a documented no-op, which is why it lives here
// unconditionally rather than behind a platform check that could drift.
WebBrowser.maybeCompleteAuthSession();

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

  // Google-flow sessions drive the same guard mechanism with their own
  // lowercase roles. 'unclaimed' admits ONLY the claim flow; 'consumer' and
  // 'collector' map straight onto their areas. Route names match these
  // strings exactly, which keeps this table honest at a glance.
  const googleActive = state.status === 'googleSignedIn';
  const googleRole = googleActive ? state.role : null;

  // Reading the keychain is fast but not instant. Showing the loading state
  // rather than the login form matters: a collector who is already signed in must
  // never see a sign-in form flash past on a cold start and think they've been
  // logged out.
  if (state.status === 'restoring') {
    return <ScreenLoading label="Restoring your session…" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Visible only with no session of either kind. */}
      <Stack.Protected guard={!signedIn && !googleActive}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>

      {/* The claim flow exists solely for unclaimed Google identities; verify
          success flips the role and Expo Router drops this subtree from the
          back stack automatically. */}
      <Stack.Protected guard={googleActive && googleRole === 'unclaimed'}>
        <Stack.Screen name="claim" />
      </Stack.Protected>

      <Stack.Protected guard={role === 'Collector' || googleRole === 'collector'}>
        <Stack.Screen name="collector" />
      </Stack.Protected>

      <Stack.Protected guard={role === 'Consumer' || googleRole === 'consumer'}>
        <Stack.Screen name="consumer" />
      </Stack.Protected>

      {/* Internal allowlist tool — self-authenticating (inline portal login,
          memory-only token), so it stays reachable regardless of app session.
          Not linked from any screen by design; reached by route directly. */}
      <Stack.Screen name="admin-allowlist" />

      <Stack.Screen name="index" />
    </Stack>
  );
}

export default function RootLayout() {
  /**
   * The preference provider wraps the navigation ThemeProvider, not the other way
   * round: navigation chrome (headers, back buttons, the card background behind a
   * push transition) has to follow the in-app choice too, or a collector who picks
   * Light gets light screens sliding over a black canvas.
   */
  return (
    <ThemePreferenceProvider>
      <NavigationTheme>
        <AnimatedSplashOverlay />
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </NavigationTheme>
    </ThemePreferenceProvider>
  );
}

/** Reads the resolved scheme, so it must sit inside the provider above. */
function NavigationTheme({ children }: { children: React.ReactNode }) {
  const scheme = useResolvedScheme();

  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>{children}</ThemeProvider>
  );
}
