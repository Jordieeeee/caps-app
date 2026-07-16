import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  useContentInsetsWithTopSpacing,
  useStackContentInsets,
} from '@/shared/hooks/use-content-insets';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { Spacing } from '@/shared/theme/twd';

interface ScreenContainerProps {
  children: ReactNode;
  /**
   * `tab` — a screen sitting directly under the tab bar. Reserves the top safe
   * area (there is no nav bar to absorb it) and the tab bar at the bottom.
   *
   * `stack` — a screen pushed inside a Stack with a visible header. The header
   * already ate the top safe area; adding it again pushes content a status-bar
   * height too low. The bottom reservation is unchanged, because the tab bar
   * stays visible under nested screens.
   */
  variant?: 'tab' | 'stack';
  onRefresh?: () => void;
  refreshing?: boolean;
}

/**
 * The scroll shell every screen in both modules should use.
 *
 * This exists because the bottom-inset bug kept coming back, and it kept coming
 * back because the fix lived in a hook that each screen had to remember to call
 * correctly. Eight collector screens and five consumer screens each hand-rolled:
 *
 *     <ScrollView
 *       contentInset={insets}                                  // iOS only!
 *       contentContainerStyle={[s, Platform.select({ android: {...}, web: {...} })]}
 *
 * — where `contentInset` is silently ignored on Android and web, so the same
 * number had to be re-expressed as padding in a `Platform.select` that handled
 * two of the three platforms. Every screen that got the incantation slightly
 * wrong put its last row under the tab bar. A hook made the number right; it did
 * not make the wiring right.
 *
 * So the wiring moves in here. A screen renders content; it does not get a say in
 * safe areas, max-width, or centring, and therefore cannot get them wrong. The
 * only decision left at the call site is `variant`, which is a fact about where
 * the screen sits, not a measurement to be re-derived.
 */
export function ScreenContainer({
  children,
  variant = 'tab',
  onRefresh,
  refreshing = false,
}: ScreenContainerProps) {
  const theme = useTheme();
  const twd = useTwdTheme();

  // Both are called unconditionally — hooks cannot be called in a branch, and
  // both are cheap reads of the same safe-area context.
  const tabInsets = useContentInsetsWithTopSpacing();
  const stackInsets = useStackContentInsets();
  const insets = variant === 'stack' ? stackInsets : tabInsets;

  return (
    <ScrollView
      style={[styles.scrollView, { backgroundColor: theme.background }]}
      contentContainerStyle={[styles.contentContainer, insets]}
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={twd.primary} />
        ) : undefined
      }>
      <ThemedView style={styles.container}>{children}</ThemedView>
    </ScrollView>
  );
}

/**
 * Standard horizontal gutter for a block inside ScreenContainer.
 *
 * The container deliberately does not pad horizontally itself: full-bleed rows
 * (the FilterChips scroller) need to reach the screen edge, so the gutter belongs
 * to the blocks that want it rather than to the shell.
 */
export function ScreenSection({
  children,
  gap = Spacing.three,
}: {
  children: ReactNode;
  gap?: number;
}) {
  return <View style={[styles.section, { gap }]}>{children}</View>;
}

const styles = StyleSheet.create({
  scrollView: { flex: 1 },
  contentContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  container: {
    maxWidth: MaxContentWidth,
    flexGrow: 1,
  },
  section: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
});
