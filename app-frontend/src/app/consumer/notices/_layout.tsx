import { Stack } from 'expo-router';

/**
 * The Notices tab's stack: notices at the root, feedback pushed on top.
 *
 * Notices was a single flat screen until feedback moved here from Account. It is a
 * stack now for the same reason Bills and Account are — a screen that pushes needs
 * one — and the tab keeps its route name because `notices.tsx` became
 * `notices/index.tsx` rather than moving anywhere the tab trigger would have to
 * follow. See consumer-tabs.tsx.
 *
 * Why feedback lives behind Notices at all: the two directions of the same
 * conversation now sit in one place. Notices is what the district says to the
 * consumer; feedback is what the consumer says back, and checking whether anyone
 * replied is the same errand as checking whether anything was announced. It was
 * previously filed under Account, beside linked accounts, editing your details and
 * signing out — a settings drawer, which is where a consumer looks for what their
 * record says about them, not for a conversation.
 *
 * `headerBackTitle` is 'Notices' throughout, so backing out of either feedback
 * screen names the place it returns to.
 */
export default function ConsumerNoticesLayout() {
  return (
    <Stack screenOptions={{ headerShown: true, headerBackTitle: 'Notices' }}>
      {/* The tab root carries its own ScreenHeader, so the nav header would print
          "Notices" twice. Same rule as bills/_layout.tsx and account/_layout.tsx. */}
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="feedback" options={{ title: 'Send feedback' }} />
      <Stack.Screen name="feedback-history" options={{ title: 'Your feedback' }} />
    </Stack>
  );
}
