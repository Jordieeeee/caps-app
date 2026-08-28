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
  /**
   * A count that belongs to the title — a CountBadge, in practice.
   *
   * Rendered hard against the title text rather than at the trailing edge, which
   * is where `action` lives. The difference is what the two mean: an action is a
   * control that happens to sit on this row, while a badge is part of the heading,
   * and a number floating at the far side of the screen reads as belonging to the
   * button beside it instead of to the word it counts.
   */
  badge?: ReactNode;
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
export function ScreenHeader({ title, subtitle, action, badge }: ScreenHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        {/* The title and its badge share a group that takes the row's slack, so
            the badge sits beside the word and the action still pins right. */}
        <View style={styles.titleGroup}>
          <ThemedText style={styles.title} accessibilityRole="header">
            {title}
          </ThemedText>
          {badge}
        </View>
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
  // Takes the slack so the action pins to the trailing edge. The title inside it
  // is free to be exactly as wide as its text, which is what lets the badge sit
  // against the last letter instead of across the screen from it.
  titleGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  // fontSize and lineHeight declared together — the pair never inherits apart.
  title: {
    // Shrinks rather than grows: a long title wraps inside this row instead of
    // pushing the badge and the button off-screen.
    flexShrink: 1,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
  },
});
