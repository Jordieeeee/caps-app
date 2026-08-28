import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { Radius } from '@/shared/theme/twd';

/**
 * A count of things waiting for attention, as a red pill.
 *
 * The number on a tinted disc rather than the solid red dot iOS puts on a tab: a
 * solid fill needs white text to reach contrast, and white on red at 12pt is the
 * worst-performing pair in this app's palette outdoors. Red text on a light red
 * wash is the same signal at a far better ratio, and it is the treatment the TWD
 * Admin Portal already uses for its own counts, so the two products agree.
 *
 * Renders nothing at zero. A badge showing 0 is a mark claiming attention for the
 * absence of anything, and a screen that always carries one is a screen where
 * nobody reads it.
 *
 * `count` is capped for display only; the accessibility label always says the real
 * number, because a screen reader has no trouble with "twelve" and a person
 * navigating by voice should not be told "nine plus".
 */
export function CountBadge({
  count,
  cap = 9,
  label,
}: {
  count: number;
  /** Above this, the badge reads `9+`. Two digits stop being legible at a glance. */
  cap?: number;
  /** What the number counts, for screen readers: "new notices". */
  label: string;
}) {
  const theme = useTwdTheme();

  if (count <= 0) return null;

  return (
    <View
      style={[styles.badge, { backgroundColor: theme.dangerSurface }]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${count} ${label}`}>
      <ThemedText type="defaultBold" style={[styles.count, { color: theme.danger }]}>
        {count > cap ? `${cap}+` : count}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    // A circle at one digit and a pill at two: `minWidth` equals the height, and
    // the horizontal padding only starts doing anything once the text outgrows it.
    minWidth: 26,
    height: 26,
    paddingHorizontal: 7,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // lineHeight matches the height so the digit sits on the disc's centre line
  // rather than on the text baseline, which is a couple of pixels low.
  count: { fontSize: 14, lineHeight: 26 },
});
