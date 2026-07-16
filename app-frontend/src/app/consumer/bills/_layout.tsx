import { Stack } from 'expo-router';

/**
 * The Bills tab's stack.
 *
 * Every screen names itself. Expo Router falls back to the raw route name when a
 * title is missing, which is how the collector's More hub shipped with "index"
 * printed across its navigation bar. A screen added here without a Stack.Screen
 * entry will do the same.
 *
 * `index` hides its header: it is the tab root and supplies its own compact
 * ScreenHeader, so a nav bar above it would print "Bills" twice.
 */
export default function ConsumerBillsLayout() {
  return (
    <Stack screenOptions={{ headerShown: true, headerBackTitle: 'Bills' }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="how-to-pay" options={{ title: 'How to pay' }} />
    </Stack>
  );
}
