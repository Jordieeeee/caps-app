import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { Spacing } from '@/shared/theme/twd';
import type { SessionSync } from '@/shared/types/auth';

/**
 * Persistent, non-blocking session-state banner.
 *
 * Deliberately motionless. Motion in this app means exactly one thing — "the app
 * is working on it" — so an offline banner that spins or pulses would be claiming
 * progress that is not happening. A collector glancing at their phone in the sun
 * needs "we are stuck" and "we are thinking" to be unmistakable at a glance, and
 * the difference is: this is a static amber bar, and loading spins.
 *
 * Not rendered at all when the session is healthy — a permanent "you're online"
 * bar trains people to ignore the strip where the real warning appears.
 *
 * It is the topmost thing in the collector shell, which on a modern handset means
 * it starts underneath hardware. It rendered from y=0 with no top inset, so
 * "Offline mode" was printed straight through the iOS status bar — the clock and
 * the Dynamic Island sat on top of the one line telling a collector their work is
 * not reaching TWD. The banner reserves that space itself now: the amber fills the
 * status-bar strip (so it still reads as one bar rather than a floating card), and
 * the text begins below the island or notch.
 *
 * One inset covers both platforms, deliberately, rather than a Platform.select of
 * hardcoded heights. `useSafeAreaInsets().top` is the Dynamic Island / notch cutout
 * on iOS and the status-bar-plus-cutout height on Android, measured by the OS —
 * and a measured value is the only kind that stays right across a device the app
 * has never run on. Horizontal insets come along for the same reason: a cutout in
 * landscape is not an iOS-only shape.
 */
export function SessionStatusBanner({ sync }: { sync: SessionSync }) {
  const theme = useTwdTheme();
  const insets = useSafeAreaInsets();

  if (sync === 'online') return null;

  const isUnsynced = sync === 'unsynced';

  return (
    <View
      style={[
        styles.banner,
        { backgroundColor: theme.warningSurface, borderColor: theme.warning },
        {
          paddingTop: insets.top + Spacing.two,
          paddingLeft: insets.left + Spacing.three,
          paddingRight: insets.right + Spacing.three,
        },
      ]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite">
      {/* A shape, not just colour: colour alone fails for colour-blind users and
          washes out in direct sunlight. */}
      <View style={[styles.dot, { backgroundColor: theme.warning }]} />
      <View style={styles.text}>
        <ThemedText type="defaultBold" style={{ color: theme.warning }}>
          {isUnsynced ? 'Unsynced session' : 'Offline mode'}
        </ThemedText>
        <ThemedText type="small" style={{ color: theme.warning }}>
          {isUnsynced
            ? 'Your sign-in could not be reconfirmed. Keep working — your records are saved on this device and will sync when you get signal.'
            : 'No connection. Your work is saved on this device and will sync automatically.'}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    // Horizontal and top padding are applied inline, on top of the safe-area
    // insets. Only the bottom is fixed here — nothing intrudes from below.
    paddingBottom: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: Spacing.one,
  },
  text: {
    flex: 1,
    gap: Spacing.half,
  },
});
