import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { Spacing } from '@/shared/theme/twd';

/**
 * "Step 1 of 2 — Account number" plus a filled segment bar.
 *
 * Two decisions worth keeping:
 *
 * The words carry the meaning and the bars only echo it. A row of dots or
 * bars alone is a designer's shorthand that assumes the reader has seen a
 * checkout flow before; TWD's consumers are the general public paying a water
 * bill, and a good share of them have not. "Step 1 of 2" cannot be
 * misread, and it survives colour blindness, glare, and a cracked screen —
 * none of which the bars do on their own.
 *
 * The whole thing is ONE accessibility node, not four. Screen readers would
 * otherwise walk a caption and a pile of anonymous Views; instead the group
 * announces "Step 1 of 2, Account number" once and moves on. The bars are
 * explicitly hidden from the tree because they say nothing the label doesn't.
 */
export function StepProgress({
  step,
  total,
  label,
}: {
  /** 1-based. */
  step: number;
  total: number;
  /** What this step is called, in the user's words — "Account number". */
  label: string;
}) {
  const theme = useTwdTheme();

  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${step} of ${total}, ${label}`}
      accessibilityValue={{ min: 1, max: total, now: step }}>
      <View style={styles.bars} importantForAccessibility="no-hide-descendants">
        {Array.from({ length: total }, (_, i) => (
          <View
            key={i}
            style={[
              styles.bar,
              // Completed and current both read as filled: the bar answers
              // "how far along am I", and a current step drawn as empty makes
              // step 1 of 2 look like no progress at all.
              { backgroundColor: i < step ? theme.primary : theme.border },
            ]}
          />
        ))}
      </View>
      <ThemedText type="small" themeColor="textSecondary" style={styles.caption}>
        Step {step} of {total} — {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two, width: '100%' },
  bars: { flexDirection: 'row', gap: Spacing.two },
  bar: { flex: 1, height: 6, borderRadius: 999 },
  caption: { textAlign: 'center' },
});
