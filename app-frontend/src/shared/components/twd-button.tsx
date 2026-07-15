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
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { MIN_TAP_TARGET, Radius, Spacing } from '@/shared/theme/twd';

interface TwdButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
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
  busy = false,
  busyLabel,
  disabled = false,
  style,
  accessibilityHint,
}: TwdButtonProps) {
  const theme = useTwdTheme();
  const inert = disabled || busy;

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
                borderColor: variant === 'secondary' ? theme.primary : 'transparent',
                borderWidth: variant === 'secondary' ? StyleSheet.hairlineWidth * 2 : 0,
                opacity: inert ? 0.5 : 1,
              },
            ]}>
            {busy && (
              <ActivityIndicator
                size="small"
                color={variant === 'primary' ? theme.onPrimary : theme.primary}
              />
            )}
            <ThemedText
              type="defaultBold"
              style={[
                styles.label,
                { color: variant === 'primary' ? theme.onPrimary : theme.primary },
              ]}>
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
