import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/shared/theme/twd';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  /**
   * A single control on the title's own row, trailing edge — a refresh button,
   * typically.
   *
   * It shares the title row rather than getting one of its own precisely because
   * of the note below: a header earns no vertical space of its own, so an action
   * placed here costs nothing, while the same button on a new line would push the
   * screen's actual content further down on every one of these screens.
   */
  action?: ReactNode;
}

/**
 * The one header pattern for tab screens.
 *
 * Compact, left-aligned, one optional line of context. The screens this replaces
 * opened with a centred 32px title and a centred descriptive paragraph inside
 * `paddingVertical: Spacing.six` — 64px above and 64px below. With the notch
 * inset on top, a collector on a 375×812 phone spent roughly the first 270px of
 * every screen on a heading, and the filters and totals they actually came for
 * started below the fold.
 *
 * A header is not interactive, so every pixel it holds is taken from something
 * tappable. Left alignment matches the Home greeting and the natural top-left
 * scan origin; the subtitle stays because these screens are used by people at a
 * range of tech familiarity, but at `small` size — context, not a headline.
 *
 * Tab screens only. Screens inside the More stack get their title from the
 * navigation header instead — giving them this header as well would print the
 * screen's name twice.
 */
export function ScreenHeader({ title, subtitle, action }: ScreenHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <ThemedText style={styles.title} accessibilityRole="header">
          {title}
        </ThemedText>
        {action}
      </View>
      {subtitle ? (
        <ThemedText type="small" themeColor="textSecondary">
          {subtitle}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: Spacing.one,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  // fontSize and lineHeight declared together — the pair never inherits apart.
  title: {
    // Takes the slack so the action pins to the trailing edge, and so a long title
    // wraps inside its own column instead of pushing the button off-screen.
    flex: 1,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
  },
});
