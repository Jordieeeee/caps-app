import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ActiveGlassSurface } from '@/shared/components/active-glass-surface';
import { Icon, type IconName } from '@/shared/components/icon';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { MIN_TAP_TARGET, Radius, Spacing } from '@/shared/theme/twd';

interface TwdButtonProps {
  label: string;
  onPress: () => void;
  /**
   * `danger` is for actions that destroy work or access — it is an outline like
   * `secondary`, in the danger tone rather than the brand one. Deliberately not a
   * filled red button: a filled destructive control is the most visually dominant
   * thing on a screen, which is backwards for something nobody should reach for by
   * accident.
   */
  variant?: 'primary' | 'secondary' | 'danger';
  /**
   * Optional leading glyph. Decorative — the label already says what the button
   * does, so the icon is hidden from screen readers rather than announced twice.
   */
  icon?: IconName;
  /** Shows a spinner and blocks input. Visually distinct from the offline state. */
  busy?: boolean;
  busyLabel?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}

export function TwdButton({
  label,
  onPress,
  variant = 'primary',
  icon,
  busy = false,
  busyLabel,
  disabled = false,
  style,
  accessibilityHint,
}: TwdButtonProps) {
  const theme = useTwdTheme();
  const inert = disabled || busy;
  // The accent an outline variant draws itself in. `primary` ignores this — it is
  // filled, and its label sits on the fill.
  const accent = variant === 'danger' ? theme.danger : theme.primary;

  return (
    <Pressable
      onPress={onPress}
      disabled={inert}
      accessibilityRole="button"
      accessibilityLabel={busy && busyLabel ? busyLabel : label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inert, busy }}
      style={style}>
      {({ pressed }) => (
        // Glass rides on the pressed state only — that is the state it signals.
        <ActiveGlassSurface active={pressed && !inert} radius={Radius.pill}>
          <View
            style={[
              styles.body,
              {
                backgroundColor:
                  variant === 'primary'
                    ? pressed && !inert
                      ? theme.primaryPressed
                      : theme.primary
                    : 'transparent',
                borderColor: variant === 'primary' ? 'transparent' : accent,
                borderWidth: variant === 'primary' ? 0 : 2,
                opacity: inert ? 0.5 : 1,
              },
            ]}>
            {busy ? (
              <ActivityIndicator
                size="small"
                color={variant === 'primary' ? theme.onPrimary : accent}
              />
            ) : icon ? (
              // Swapped for the spinner rather than shown alongside it — the icon's
              // slot becomes the busy slot, so the label never shifts sideways when
              // the button starts working.
              <Icon
                name={icon}
                size={18}
                color={variant === 'primary' ? theme.onPrimary : accent}
              />
            ) : null}
            <ThemedText
              type="defaultBold"
              style={[styles.label, { color: variant === 'primary' ? theme.onPrimary : accent }]}>
              {busy && busyLabel ? busyLabel : label}
            </ThemedText>
          </View>
        </ActiveGlassSurface>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: {
    minHeight: MIN_TAP_TARGET,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.four,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  label: {
    fontSize: 17,
    textAlign: 'center',
  },
});
