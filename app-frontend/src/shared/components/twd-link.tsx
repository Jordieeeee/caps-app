import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { MIN_TAP_TARGET, Spacing } from '@/shared/theme/twd';

interface TwdLinkProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Text-weight action.
 *
 * The third rung of the action hierarchy, below filled and outlined buttons. It
 * exists so a secondary path can be reachable without competing: two full-width
 * buttons stacked read as a choice between equals no matter how their fills
 * differ, because the silhouette is what carries weight at a glance.
 *
 * Underlined rather than colour-only — colour must never be the sole signal that
 * something is tappable.
 */
export function TwdLink({ label, onPress, disabled, accessibilityHint, style }: TwdLinkProps) {
  const theme = useTwdTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="link"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
      // Text is 14pt but the target is not: the box is padded out to the 48dp
      // floor so the tap area never shrinks to the glyphs.
      style={[styles.pressable, disabled && styles.disabled, style]}>
      {({ pressed }) => (
        <ThemedText
          type="smallBold"
          style={[styles.label, { color: theme.primary, opacity: pressed && !disabled ? 0.6 : 1 }]}>
          {label}
        </ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    minHeight: MIN_TAP_TARGET,
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
  },
  label: {
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
  disabled: {
    opacity: 0.5,
  },
});
