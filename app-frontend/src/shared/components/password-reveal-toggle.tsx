import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { MIN_TAP_TARGET, Spacing } from '@/shared/theme/twd';

interface PasswordRevealToggleProps {
  revealed: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

/**
 * Reveal control for a password field.
 *
 * Deliberately a word rather than an eye icon. `expo-symbols` is SF Symbols and
 * renders nothing on Android, which is where most collectors are, and no
 * cross-platform icon set is installed — so an icon here would mean either a new
 * dependency or a glyph that silently disappears on the majority platform. The
 * crossed-eye icon is also genuinely ambiguous (does it mean "password is hidden"
 * or "tap to hide"?), and this app serves a wide range of tech familiarity. A verb
 * that states what the tap will do needs no legend.
 */
export function PasswordRevealToggle({ revealed, onToggle, disabled }: PasswordRevealToggleProps) {
  const theme = useTwdTheme();

  return (
    <Pressable
      onPress={onToggle}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
      accessibilityHint={
        revealed ? 'Masks the password you typed' : 'Displays the password you typed as plain text'
      }
      accessibilityState={{ disabled: !!disabled }}
      // Hit slop is not enough on its own here; the control carries a real 48dp
      // box so it stays tappable for someone working one-handed in the rain.
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: pressed && !disabled ? theme.backgroundSelected : 'transparent' },
        disabled && styles.disabled,
      ]}>
      <ThemedText type="smallBold" style={{ color: theme.primary }}>
        {revealed ? 'Hide' : 'Show'}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minWidth: MIN_TAP_TARGET,
    minHeight: MIN_TAP_TARGET,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
});
