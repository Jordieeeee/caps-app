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

  /**
   * Disabled and busy look different, because they mean different things.
   *
   * ⚠️ THE ONLY DISABLED TREATMENT USED TO BE `opacity: 0.5`, and on a filled
   * primary button that is not enough: a half-opacity brand fill on a dark ground
   * still reads as a live control. "Submit to Admin" was correctly unpressable once
   * everything had synced, and still looked exactly like a button somebody should
   * press — so a collector taps it, nothing happens, and the screen has told them
   * nothing about why.
   *
   * A disabled button keeps its colour and goes DARK: the same blue, dimmed to the
   * pressed shade. It stays recognisably the same control — this is the button that
   * submits, and turning it grey would make it look like a different thing — while
   * being visibly spent. Busy keeps the full fill on purpose: the button is working,
   * and dimming mid-submit would read as the action having been cancelled.
   */
  const off = disabled && !busy;

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
            /**
             * Pinned as a real native view — see the note in
             * active-glass-surface.tsx. This is the view the device named as 6102:
             * Fabric flattened it out from under its own ActivityIndicator and
             * label when the button went busy, and the re-parent crashed Android.
             */
            collapsable={false}
            style={[
              styles.body,
              {
                backgroundColor:
                  variant === 'primary'
                    ? // Same blue throughout: the darker pressed shade when the
                      // button is spent, and when it is being pressed.
                      off || (pressed && !inert)
                      ? theme.primaryPressed
                      : theme.primary
                    : 'transparent',
                borderColor: variant === 'primary' ? 'transparent' : accent,
                borderWidth: variant === 'primary' ? 0 : 2,
                // A filled primary is already dark when off, so it only needs a
                // little help; an outline button has no fill to darken and relies on
                // the fade entirely.
                opacity: busy ? 0.5 : off ? (variant === 'primary' ? 0.7 : 0.5) : 1,
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
