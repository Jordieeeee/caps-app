import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/shared/auth/auth-context';

/**
 * Claim-flow shell, for BOTH the first claim and every one after it.
 *
 * 'unclaimed' is someone claiming their first house; the root layout sends them
 * here on sign-in and verify success swaps their role, at which point both
 * guards drop this subtree from history and the consumer area takes over.
 *
 * 'consumer' is someone who already holds a house and is adding another, and
 * they reach these screens deliberately from Account → Add another account. It
 * is the same two steps proving the same thing about a different account
 * number, so it is the same flow — a second copy of it would be two places to
 * fix when the OTP contract changes. What differs is the copy and where success
 * lands, and both are driven by the `mode` param the entry point passes.
 *
 * Still a hard redirect for everyone else, so a deep link cannot park a
 * collector or a signed-out visitor inside the group.
 */
export default function ClaimLayout() {
  const { state } = useAuth();

  const claiming = state.status === 'googleSignedIn' && state.role === 'unclaimed';
  const addingAnother = state.status === 'googleSignedIn' && state.role === 'consumer';

  if (!claiming && !addingAnother) {
    return <Redirect href="/" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="account" />
      <Stack.Screen name="verify" />
    </Stack>
  );
}
