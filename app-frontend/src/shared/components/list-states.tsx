import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon, type IconName } from '@/shared/components/icon';
import { TwdButton } from '@/shared/components/twd-button';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { Radius, Spacing } from '@/shared/theme/twd';

/**
 * The states a list can be in besides "has rows".
 *
 * The skill's UX guidance is blunt about this ("Show helpful message and action /
 * Don't: blank empty screens") and it matters more here than on a normal app,
 * because offline-first means "nothing on screen" has at least four distinct
 * causes a collector needs told apart:
 *
 *   - still loading from local storage
 *   - loaded, genuinely nothing recorded yet today
 *   - loaded, but the read failed
 *   - there IS data, it just hasn't reached the server
 *
 * Collapsing those into one blank list is what makes a field worker re-enter
 * readings they already took. Motion is the tell: only ListLoading animates. If it
 * is not spinning, the app is not working on it — matching the ScreenLoading /
 * SessionStatusBanner split already established in screen-message.tsx.
 */

interface ListEmptyProps {
  title: string;
  body: string;
  icon?: IconName;
  action?: { label: string; onPress: () => void };
}

export function ListEmpty({ title, body, icon = 'inbox', action }: ListEmptyProps) {
  const theme = useTwdTheme();

  return (
    <View style={[styles.container, { borderColor: theme.border }]}>
      <Icon name={icon} size={32} color={theme.textSecondary} />
      <ThemedText type="defaultBold" style={styles.centered}>
        {title}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
        {body}
      </ThemedText>
      {action && (
        <TwdButton label={action.label} onPress={action.onPress} style={styles.action} />
      )}
    </View>
  );
}

export function ListLoading({ label = 'Loading…' }: { label?: string }) {
  const theme = useTwdTheme();

  return (
    <View style={[styles.container, { borderColor: theme.border }]}>
      <ActivityIndicator size="small" color={theme.primary} />
      <ThemedText type="small" themeColor="textSecondary" accessibilityLiveRegion="polite">
        {label}
      </ThemedText>
    </View>
  );
}

interface ListErrorProps {
  title?: string;
  body: string;
  onRetry?: () => void;
}

export function ListError({ title = 'Could not load', body, onRetry }: ListErrorProps) {
  const theme = useTwdTheme();

  return (
    <View
      style={[styles.container, { borderColor: theme.danger, backgroundColor: theme.dangerSurface }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive">
      <Icon name="alert-triangle" size={32} color={theme.danger} />
      <ThemedText type="defaultBold" style={[styles.centered, { color: theme.danger }]}>
        {title}
      </ThemedText>
      <ThemedText type="small" style={[styles.centered, { color: theme.danger }]}>
        {body}
      </ThemedText>
      {onRetry && <TwdButton label="Try again" onPress={onRetry} style={styles.action} />}
    </View>
  );
}

/**
 * Not an error and not a blocker — the rows below are real and usable, they just
 * live only on this device so far. Amber, static, and never in place of content:
 * this sits above the list, it does not replace it.
 */
export function PendingSyncNotice({ count }: { count: number }) {
  const theme = useTwdTheme();
  if (count <= 0) return null;

  return (
    <View
      style={[styles.notice, { borderColor: theme.warning, backgroundColor: theme.warningSurface }]}
      accessible
      accessibilityRole="summary">
      <Icon name="cloud-off" size={20} color={theme.warning} />
      <ThemedText type="small" style={[styles.noticeText, { color: theme.warning }]}>
        {count === 1
          ? '1 record is saved on this device and not yet sent to TWD.'
          : `${count} records are saved on this device and not yet sent to TWD.`}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.five,
    borderRadius: Radius.card,
    borderWidth: 2,
    // Dashed reads as "a container that could hold something" rather than as a
    // card that failed to render.
    borderStyle: 'dashed',
  },
  centered: { textAlign: 'center' },
  action: { alignSelf: 'stretch', marginTop: Spacing.two },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.card,
    borderWidth: 2,
  },
  noticeText: { flex: 1 },
});
