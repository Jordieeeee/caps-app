import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/shared/auth/auth-context';

/**
 * Claim-flow shell. Reachable only by a Google identity whose DB-derived role
 * is still 'unclaimed' — the same gate the root layout applies declaratively,
 * repeated here as a hard redirect so deep links can't park inside the group.
 *
 * verify success swaps the session role; both guards then drop this whole
 * subtree from history before the consumer area admits the user.
 */
export default function ClaimLayout() {
  const { state } = useAuth();

  if (!(state.status === 'googleSignedIn' && state.role === 'unclaimed')) {
    return <Redirect href="/" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="account" />
      <Stack.Screen name="verify" />
    </Stack>
  );
}
