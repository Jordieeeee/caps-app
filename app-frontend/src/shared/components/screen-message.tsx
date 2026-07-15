import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TwdButton } from '@/shared/components/twd-button';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { MaxContentWidth } from '@/constants/theme';
import { Radius, Spacing } from '@/shared/theme/twd';

type Tone = 'neutral' | 'warning' | 'danger';

interface ScreenMessageProps {
  title: string;
  body: string;
  tone?: Tone;
  action?: { label: string; onPress: () => void; busy?: boolean; busyLabel?: string };
  secondaryAction?: { label: string; onPress: () => void };
}

/**
 * Full-screen explanation for a blocking state.
 *
 * Section 4's states are screens, not toasts, on purpose: a toast for "your
 * session expired" disappears before a user has read it and leaves them staring
 * at a login form with no idea why they are looking at it.
 */
export function ScreenMessage({
  title,
  body,
  tone = 'neutral',
  action,
  secondaryAction,
}: ScreenMessageProps) {
  const theme = useTwdTheme();
  const accent =
    tone === 'danger' ? theme.danger : tone === 'warning' ? theme.warning : theme.primary;
  const surface =
    tone === 'danger' ? theme.dangerSurface : tone === 'warning' ? theme.warningSurface : undefined;

  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        <View
          style={[styles.badge, { backgroundColor: surface ?? theme.backgroundElement }]}
          accessible
          accessibilityRole="image"
          accessibilityLabel={tone === 'danger' ? 'Error' : 'Notice'}>
          <View style={[styles.badgeDot, { backgroundColor: accent }]} />
        </View>

        <ThemedText type="subtitle" style={styles.centered}>
          {title}
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.centered}>
          {body}
        </ThemedText>

        {action && (
          <TwdButton
            label={action.label}
            onPress={action.onPress}
            busy={action.busy}
            busyLabel={action.busyLabel}
            style={styles.action}
          />
        )}
        {secondaryAction && (
          <TwdButton
            label={secondaryAction.label}
            onPress={secondaryAction.onPress}
            variant="secondary"
            style={styles.action}
          />
        )}
      </View>
    </ThemedView>
  );
}

/**
 * The app is thinking.
 *
 * Motion is reserved for exactly this. See SessionStatusBanner for the deliberate
 * contrast: anything that spins is making progress, anything static amber is not.
 */
export function ScreenLoading({ label = 'Loading…' }: { label?: string }) {
  const theme = useTwdTheme();
  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        <ActivityIndicator size="large" color={theme.primary} />
        <ThemedText themeColor="textSecondary" accessibilityLiveRegion="polite">
          {label}
        </ThemedText>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  content: {
    alignItems: 'center',
    gap: Spacing.three,
    maxWidth: MaxContentWidth,
    width: '100%',
  },
  centered: {
    textAlign: 'center',
  },
  badge: {
    width: 64,
    height: 64,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  badgeDot: {
    width: 20,
    height: 20,
    borderRadius: Radius.pill,
  },
  action: {
    alignSelf: 'stretch',
    marginTop: Spacing.two,
  },
});
