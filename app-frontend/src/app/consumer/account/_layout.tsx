import { Stack } from 'expo-router';

/**
 * The Account tab's stack: linked accounts at the root, feedback pushed on top.
 *
 * See bills/_layout.tsx — same rule, same reason. Every screen names itself, and
 * the tab root hides the nav header because it carries its own ScreenHeader.
 */
export default function ConsumerAccountLayout() {
  return (
    <Stack screenOptions={{ headerShown: true, headerBackTitle: 'Account' }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="feedback" options={{ title: 'Send feedback' }} />
    </Stack>
  );
}
