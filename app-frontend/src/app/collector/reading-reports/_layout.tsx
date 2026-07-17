import { Stack } from 'expo-router';

/**
 * The Readings tab's stack.
 *
 * Readings became a stack when meter entry moved onto its own screen. The route
 * list is the tab root and keeps its own compact ScreenHeader, so its navigation
 * header stays hidden — showing it would print "Readings" twice, once in the nav
 * bar and once in the header underneath it.
 *
 * The reading screen is pushed, and it does show a navigation header: it is the
 * only screen in the collector module a person can be halfway through, and the
 * back button is what says "you can leave without saving". Its title is set at
 * render time to the account number, because a header reading "Meter Reading"
 * tells a collector standing at a gate nothing they do not already know, and the
 * account number is the one fact worth confirming before they type.
 */
export default function CollectorReadingsLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="[id]" options={{ headerShown: true, headerBackTitle: 'Route' }} />
    </Stack>
  );
}
