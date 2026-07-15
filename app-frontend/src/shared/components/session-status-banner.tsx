import { StyleSheet, View } from 'react-native';

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
 */
export function SessionStatusBanner({ sync }: { sync: SessionSync }) {
  const theme = useTwdTheme();

  if (sync === 'online') return null;

  const isUnsynced = sync === 'unsynced';

  return (
    <View
      style={[styles.banner, { backgroundColor: theme.warningSurface, borderColor: theme.warning }]}
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
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
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
