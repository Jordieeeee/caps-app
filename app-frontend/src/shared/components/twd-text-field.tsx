import { forwardRef, useState, type ReactNode } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { MIN_TAP_TARGET, Radius, Spacing } from '@/shared/theme/twd';

interface TwdTextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  /** Field-level error. Rendered as text, not colour alone. */
  error?: string;
  /** Static helper text, shown when there is no error. */
  hint?: string;
  /**
   * Control rendered inside the field's trailing edge — a password reveal toggle,
   * typically. It shares the field's row rather than floating over it, so it can
   * never overlap long input.
   */
  trailingAccessory?: ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
}

/**
 * Labelled text input.
 *
 * The field keeps one opaque fill in every state and signals focus with its border
 * alone. It previously went `transparent` on focus so a glass tint could show
 * through, which meant the focused field composited a 12%-alpha blue over the page
 * background while the resting field sat on `backgroundElement` — two different
 * surfaces, so whichever field had focus looked like a styling mistake rather than
 * a focused field. Glass also never rendered on Android at all (see
 * ActiveGlassSurface), which is where TWD's collectors overwhelmingly are, so the
 * treatment cost every platform its surface consistency while paying off on none
 * of the ones that matter here.
 */
export const TwdTextField = forwardRef<TextInput, TwdTextFieldProps>(function TwdTextField(
  { label, error, hint, trailingAccessory, containerStyle, onFocus, onBlur, ...inputProps },
  ref
) {
  const theme = useTwdTheme();
  const [focused, setFocused] = useState(false);

  // Border width is constant across states; only the colour moves. A border that
  // thickens on focus would reflow the field and shift the form under the user's
  // thumb mid-tap.
  const borderColor = error ? theme.danger : focused ? theme.primary : theme.border;

  return (
    <View style={[styles.container, containerStyle]}>
      <ThemedText type="defaultBold" style={styles.label}>
        {label}
      </ThemedText>

      <View
        style={[
          styles.row,
          {
            borderColor,
            backgroundColor: theme.backgroundElement,
            borderRadius: Radius.field,
          },
        ]}>
        <TextInput
          ref={ref}
          style={[styles.input, { color: theme.text }]}
          placeholderTextColor={theme.textSecondary}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          accessibilityLabel={label}
          accessibilityHint={hint}
          // Announce the error to screen readers, not just to sighted users.
          accessibilityState={{ disabled: inputProps.editable === false }}
          {...inputProps}
        />
        {trailingAccessory}
      </View>

      {error ? (
        <ThemedText type="small" style={{ color: theme.danger }} accessibilityLiveRegion="polite">
          {error}
        </ThemedText>
      ) : hint ? (
        <ThemedText type="small" themeColor="textSecondary">
          {hint}
        </ThemedText>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  label: {
    fontSize: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: MIN_TAP_TARGET,
    borderWidth: 2,
    // Clips the accessory's press highlight to the field's rounded corners.
    overflow: 'hidden',
  },
  input: {
    flex: 1,
    minHeight: MIN_TAP_TARGET,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 17,
  },
});
