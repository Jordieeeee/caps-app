import { Stack } from 'expo-router';

/**
 * The Route tab's stack.
 *
 * Route became a stack when meter entry moved onto its own screen. The route list
 * is the tab root and keeps its own compact ScreenHeader, so its navigation header
 * stays hidden — showing it would print "Route" twice, once in the nav bar and once
 * in the header underneath it.
 *
 * The reading screen is pushed, and it does show a navigation header: it is the
 * only screen in the collector module a person can be halfway through, and the
 * back button is what says "you can leave without saving". Its title is set at
 * render time to the account number, because a header reading "Meter Reading"
 * tells a collector standing at a gate nothing they do not already know, and the
 * account number is the one fact worth confirming before they type.
 *
 * Reconnections and disconnections live here too, and they used to live under More.
 * They are field work at an address — the collector is standing at the same gate,
 * on the same round, holding an order instead of a meter — so they belong with the
 * route rather than behind the hub that holds sync detail and the sign-out button.
 * Their folders deliberately have no `_layout` of their own: a nested stack would
 * render its own header underneath this one, two bars and two back buttons for what
 * is one push.
 *
 * Every pushed screen declares a title. Expo Router falls back to the raw route
 * name when none is set, which is how a screen ends up with "index" printed across
 * its navigation bar. The `[id]` titles are placeholders — each confirm screen sets
 * its own at render time — but the entry still has to exist, or the fallback prints
 * "[id]".
 */
export default function CollectorReadingsLayout() {
  return (
    <Stack screenOptions={{ headerBackTitle: 'Route' }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="[id]" options={{ headerShown: true }} />
      <Stack.Screen name="reconnections/index" options={{ title: 'Reconnections' }} />
      <Stack.Screen
        name="reconnections/[id]"
        options={{ title: 'Reconnection', headerBackTitle: 'Orders' }}
      />
      <Stack.Screen name="disconnections/index" options={{ title: 'Disconnections' }} />
      <Stack.Screen
        name="disconnections/[id]"
        options={{ title: 'Disconnection', headerBackTitle: 'Orders' }}
      />
    </Stack>
  );
}
