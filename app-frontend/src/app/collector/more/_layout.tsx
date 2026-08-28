import { Stack } from 'expo-router';

/**
 * The More tab's stack.
 *
 * A stack, not a tab group: everything in here is low-frequency work a collector
 * reaches deliberately (checking sync detail, filing a service order, signing off
 * at the end of a shift), and each screen wants a back button to a hub rather than
 * a permanent slot in a five-wide bar competing with the route work.
 *
 * Every screen declares a title. Expo Router falls back to the raw route name
 * when none is set, which is how the hub shipped with "index" printed across its
 * navigation bar — the router's filename leaking into a government app's UI.
 * A screen added here without a Stack.Screen entry will do the same, so the list
 * below is not optional bookkeeping.
 *
 * Reconnections and disconnections used to be here and are now in the Route stack.
 * They are field work at an address, not hub work: the collector is standing at the
 * same gate on the same round, holding an order instead of a meter. See
 * reading-reports/_layout.tsx.
 */
export default function CollectorMoreLayout() {
  return (
    <Stack screenOptions={{ headerShown: true, headerBackTitle: 'More' }}>
      <Stack.Screen name="index" options={{ title: 'More' }} />
      <Stack.Screen name="account" options={{ title: 'Account' }} />
      <Stack.Screen
        name="edit-details"
        options={{ title: 'Edit Details', headerBackTitle: 'Account' }}
      />
      {/* "Password" covers setting and changing alike — a header promising "Set a
          password" over a change form is the wrong promise for half the people who
          open it. */}
      <Stack.Screen
        name="set-password"
        options={{ title: 'Password', headerBackTitle: 'Account' }}
      />
      <Stack.Screen name="sync-status" options={{ title: 'Sync Status' }} />
      <Stack.Screen name="printer" options={{ title: 'Printer' }} />
    </Stack>
  );
}
