import { forwardRef, useState } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ActiveGlassSurface } from '@/shared/components/active-glass-surface';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { MIN_TAP_TARGET, Radius, Spacing } from '@/shared/theme/twd';

interface TwdTextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  /** Field-level error. Rendered as text, not colour alone. */
  error?: string;
  /** Static helper text, shown when there is no error. */
  hint?: string;
  containerStyle?: StyleProp<ViewStyle>;
}

/**
 * Labelled text input. The focused state gets the glass treatment (over a solid
 * fallback — see ActiveGlassSurface); the resting state deliberately does not.
 */
export const TwdTextField = forwardRef<TextInput, TwdTextFieldProps>(function TwdTextField(
  { label, error, hint, containerStyle, onFocus, onBlur, ...inputProps },
  ref
) {
  const theme = useTwdTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.container, containerStyle]}>
      <ThemedText type="defaultBold" style={styles.label}>
        {label}
      </ThemedText>

      <ActiveGlassSurface active={focused} radius={Radius.field}>
        <TextInput
          ref={ref}
          style={[
            styles.input,
            {
              color: theme.text,
              borderRadius: Radius.field,
              // The resting field still needs a visible boundary; only the
              // emphasis changes on focus.
              borderColor: error ? theme.danger : focused ? 'transparent' : theme.border,
              backgroundColor: focused ? 'transparent' : theme.backgroundElement,
            },
          ]}
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
      </ActiveGlassSurface>

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
  input: {
    minHeight: MIN_TAP_TARGET,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth * 2,
    fontSize: 17,
  },
});
