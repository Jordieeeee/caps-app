import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/shared/components/icon';
import { TwdButton } from '@/shared/components/twd-button';
import { usePrint } from '@/shared/hooks/use-print';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { Spacing } from '@/shared/theme/twd';

interface PrintButtonProps {
  label: string;
  /** The actual print job. Runs only once the preflight passes. */
  job: () => Promise<void>;
  variant?: 'primary' | 'secondary';
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}

/**
 * A Print button that knows whether printing is possible.
 *
 * Every print action in the collector module renders this, so the gate and its
 * wording cannot drift between the five screens that print. Disabled state carries
 * a reason underneath rather than just greying out: a dead grey rectangle tells a
 * collector the app is broken, where "Connect printer to print" tells them what to
 * do — and the printer card on Home and the row in More are both one tap away.
 *
 * The button stays disabled rather than tapping through to an alert because the
 * printer's state is knowable *before* the tap; making someone commit to printing a
 * receipt in front of a waiting customer only to be told there is no printer is
 * information delivered one moment too late. usePrint keeps its own preflight
 * regardless — BLE can drop between this render and the tap.
 */
export function PrintButton({
  label,
  job,
  variant = 'secondary',
  style,
  accessibilityHint,
}: PrintButtonProps) {
  const theme = useTwdTheme();
  const { print, printing, canPrint, printBlockedReason } = usePrint();

  return (
    <View style={[styles.wrap, style]}>
      <TwdButton
        label={label}
        icon="printer"
        variant={variant}
        busy={printing}
        busyLabel="Printing…"
        disabled={!canPrint}
        onPress={() => void print(job)}
        accessibilityHint={printBlockedReason ?? accessibilityHint}
      />
      {printBlockedReason && (
        <View style={styles.hint}>
          <Icon name="bluetooth" size={14} color={theme.textSecondary} />
          <ThemedText type="small" themeColor="textSecondary">
            {printBlockedReason}
          </ThemedText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
  },
});
