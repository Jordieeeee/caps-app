import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/shared/components/icon';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { MIN_TAP_TARGET, Radius, Spacing } from '@/shared/theme/twd';

interface RefreshButtonProps {
  onPress: () => void;
  /** True while a refresh is in flight — swaps the glyph for a spinner. */
  busy?: boolean;
  /** Names the thing being refreshed, for screen readers: "bills", "notices". */
  subject: string;
}

/**
 * A visible way to re-fetch the screen.
 *
 * Pull-to-refresh already works on every screen in this shell, and it is not
 * enough on its own: it is an invisible gesture with no affordance, and this app
 * is used by the general public across a wide range of phone familiarity — someone
 * who has never discovered the pull gesture has no way to ask for fresh data at
 * all, and a bill or an interruption notice is exactly the thing they will want to
 * re-check. The gesture stays; this is the discoverable path to the same action.
 *
 * Deliberately an icon rather than an icon plus the word "Refresh": it sits on the
 * header's own row so it costs no vertical space, and that row already carries the
 * screen title. `accessibilityLabel` names the action in full, so nothing is left
 * to the glyph for anyone using a screen reader.
 *
 * The label is not merely "Refresh" — it says what will be refreshed, because a
 * screen reader user landing on a bare "Refresh" button has to guess its scope.
 */
export function RefreshButton({ onPress, busy = false, subject }: RefreshButtonProps) {
  const theme = useTwdTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={busy ? `Refreshing ${subject}` : `Refresh ${subject}`}
      accessibilityState={{ disabled: busy, busy }}
      hitSlop={8}
      style={({ pressed }) => [
        styles.button,
        {
          borderColor: theme.border,
          backgroundColor: pressed ? theme.backgroundSelected : 'transparent',
        },
      ]}>
      {busy ? (
        <ActivityIndicator size="small" color={theme.primary} />
      ) : (
        <Icon name="refresh" size={20} color={theme.primary} />
      )}
    </Pressable>
  );
}

/**
 * The line shown when a refresh failed but the rows on screen are still the last
 * good answer. See `refreshFailed` in shared/hooks/use-async.ts for why those rows
 * are kept rather than discarded.
 */
export function RefreshFailedNotice({ subject }: { subject: string }) {
  const theme = useTwdTheme();

  return (
    <ThemedText
      type="small"
      style={[styles.notice, { color: theme.warning }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite">
      Couldn&apos;t check for new {subject} — showing what we last received. Check your
      connection and try again.
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  button: {
    width: MIN_TAP_TARGET,
    height: MIN_TAP_TARGET,
    borderRadius: Radius.field,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notice: {
    paddingHorizontal: Spacing.four,
    lineHeight: 20,
  },
});
