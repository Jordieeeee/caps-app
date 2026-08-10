import { Stack } from 'expo-router';

/**
 * The Account tab's stack: linked accounts at the root, details editing on top.
 *
 * See bills/_layout.tsx — same rule, same reason. Every screen names itself, and
 * the tab root hides the nav header because it carries its own ScreenHeader.
 *
 * Feedback used to be here and is now behind Notices: it is a conversation with the
 * district, not a fact about the consumer's record. See notices/_layout.tsx.
 */
export default function ConsumerAccountLayout() {
  return (
    <Stack screenOptions={{ headerShown: true, headerBackTitle: 'Account' }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="edit-details" options={{ title: 'Edit my details' }} />
      {/* "Request an account", not "Link an account" — the header is the first thing
          read on the screen and it has to make the same promise the button does. The
          app cannot link anything; it asks TWD to. */}
      <Stack.Screen name="link-account" options={{ title: 'Request an account' }} />
    </Stack>
  );
}
