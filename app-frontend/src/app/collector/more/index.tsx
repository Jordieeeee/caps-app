import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { usePrinter } from '@/collector/services/printer-state';
import { SyncService } from '@/collector/services/sync-service';
import { syncClaim, timeOfDay, type SyncClaim } from '@/collector/services/today';
import { useAuth, useSession } from '@/shared/auth/auth-context';
import { Icon, type IconName } from '@/shared/components/icon';
import { ScreenContainer, ScreenSection } from '@/shared/components/screen-container';
import { ScreenHeader } from '@/shared/components/screen-header';
import { SkeletonBlock } from '@/shared/components/skeleton';
import { TwdButton } from '@/shared/components/twd-button';
import { useAsync } from '@/shared/hooks/use-async';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { MIN_TAP_TARGET, Radius, Spacing } from '@/shared/theme/twd';

/**
 * The More hub: session, service orders, sync detail, sign out.
 *
 * This is where the old Home screen's content ended up. Home was showing a
 * collector their own name and a sign-out button as the first thing they saw each
 * shift — a profile page occupying the most valuable tab in the bar, while the
 * route they were about to walk was two taps away. Identity is not a destination
 * a field worker navigates to; it is something they confirm once and forget.
 */
export default function CollectorMore() {
  const { session, sync } = useSession();
  const { state, reload } = useAsync(useCallback(() => SyncService.getSyncStatus(), []));
  const router = useRouter();
  const printer = usePrinter();

  // An unknown count is treated as unsafe, never as zero. The one thing worse than
  // a spurious warning is a silent sign-out that drops a shift's work.
  const claim: SyncClaim | null = state.status === 'ready' ? syncClaim(state.data) : null;

  return (
    <ScreenContainer>
      <ScreenHeader
        title={session.user.name}
        subtitle={`Collector · ${session.user.routeIds?.join(', ') || 'No routes assigned'}`}
      />

      <ScreenSection gap={Spacing.two}>
        <NavRow
          icon="refresh"
          label="Sync status"
          detail={
            state.status === 'loading'
              ? '…'
              : !claim
                ? 'Unavailable'
                : claim.kind === 'pending'
                  ? `${claim.count} waiting`
                  : claim.kind === 'never'
                    ? 'Nothing sent yet'
                    : `Sent ${timeOfDay(claim.lastSync)}`
          }
          tone={!claim || claim.kind === 'pending' ? 'warning' : undefined}
          onPress={() => router.push('/collector/more/sync-status')}
        />
        {/* Live, not a one-shot read. This used to call PrinterService.isConnected()
            during render — a value that never changed after mount and never noticed
            the PT-210 being switched off. */}
        <NavRow
          icon="printer"
          label="Printer"
          detail={
            printer.status === 'connected'
              ? (printer.deviceName ?? 'Connected')
              : printer.status === 'connecting'
                ? 'Connecting…'
                : 'Not connected'
          }
          onPress={() => router.push('/collector/more/printer')}
        />
        <NavRow
          icon="file-check"
          label="Reconnections"
          detail="Restore service"
          onPress={() => router.push('/collector/more/reconnections')}
        />
        {/* Previously unreachable: disconnections.tsx had no tab trigger and no
            link anywhere in src/. It shipped as ~300 lines of dead route. */}
        <NavRow
          icon="alert-triangle"
          label="Disconnections"
          detail="Delinquent accounts"
          onPress={() => router.push('/collector/more/disconnections')}
        />
      </ScreenSection>

      <ScreenSection gap={Spacing.three}>
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="defaultBold">Session</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {sync === 'online'
              ? 'Connected. Records send automatically while the app is open.'
              : sync === 'offline'
                ? 'No connection. Your work is saved on this device.'
                : 'Sign-in not reconfirmed. Your work is saved on this device.'}
          </ThemedText>
        </ThemedView>

        <SignOutBlock claim={claim} loading={state.status === 'loading'} onRetry={reload} />
      </ScreenSection>
    </ScreenContainer>
  );
}

/**
 * Sign out, weighted by what it would actually cost right now.
 *
 * The warning used to be permanent: the same red block, with the same words, on
 * every visit, whether the collector had forty unsent records or none. A warning
 * that is always on is not a warning — it is wallpaper, and a collector who has
 * scrolled past it two hundred times will scroll past it on the day it is true.
 * That is the whole argument for making it conditional.
 *
 * So there are three states, and they are not cosmetic variants — they are three
 * different claims:
 *
 *   pending → red, counts the records, and the confirmation repeats the count.
 *   never   → red too. An empty outbox that has never once drained is not proof of
 *             safety; it means nothing was ever sent from this phone, and calling
 *             that "all clear" is the exact failure the conditional exists to stop.
 *   sent    → neutral, low-emphasis, and *timestamped*. "All records sent · 14:32",
 *             never a bare "Synced" — see today.ts. The app knows what it sent and
 *             when; it cannot know that TWD still holds it, or that signal exists
 *             this second.
 *
 * Unknown (claim === null) is red. Failing to read the count is not evidence there
 * is nothing to lose.
 */
function SignOutBlock({
  claim,
  loading,
  onRetry,
}: {
  claim: SyncClaim | null;
  loading: boolean;
  onRetry: () => void;
}) {
  const theme = useTwdTheme();
  const { signOut } = useAuth();
  const router = useRouter();

  if (loading) {
    return (
      <View style={styles.signOutSection}>
        <SkeletonBlock height={64} />
        <SkeletonBlock height={MIN_TAP_TARGET} />
      </View>
    );
  }

  const atRisk = claim === null || claim.kind === 'pending' || claim.kind === 'never';

  const count = claim?.kind === 'pending' ? claim.count : null;
  const countPhrase =
    count === null
      ? claim === null
        ? 'Some records may still be saved on this phone only.'
        : 'Nothing has been sent to TWD from this phone yet.'
      : count === 1
        ? '1 record hasn’t reached TWD.'
        : `${count} records haven’t reached TWD.`;

  const confirmSignOut = () => {
    if (!atRisk && claim?.kind === 'sent') {
      Alert.alert('Sign out?', "You'll need a connection to sign back in.", [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
      ]);
      return;
    }

    // The count is repeated here on purpose. The block above is glanceable; this is
    // the last moment before the work is gone, and it should be impossible to
    // dismiss without having read the number.
    Alert.alert(
      count !== null ? `Sign out and lose ${count} record${count === 1 ? '' : 's'}?` : 'Sign out and lose unsent work?',
      `${countPhrase}\n\nSigning out clears this phone's session and those records with it. They cannot be recovered. Connect to the internet and sync first if you can.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Go to Sync', onPress: () => router.push('/collector/more/sync-status') },
        { text: 'Sign out anyway', style: 'destructive', onPress: () => void signOut() },
      ]
    );
  };

  return (
    <View style={styles.signOutSection}>
      {atRisk ? (
        <Pressable
          onPress={claim === null ? onRetry : () => router.push('/collector/more/sync-status')}
          accessibilityRole="button"
          accessibilityLabel={`${countPhrase} ${claim === null ? 'Tap to retry.' : 'Opens sync status.'}`}
          style={({ pressed }) => [
            styles.warning,
            {
              borderColor: theme.danger,
              backgroundColor: pressed ? theme.backgroundSelected : theme.dangerSurface,
            },
          ]}>
          <Icon name="alert-triangle" size={20} color={theme.danger} />
          <View style={styles.warningText}>
            <ThemedText type="defaultBold" style={{ color: theme.danger }}>
              {countPhrase}
            </ThemedText>
            <ThemedText type="small" style={{ color: theme.danger }}>
              Signing out clears this phone&apos;s session and deletes them. Sync before you
              sign out.
            </ThemedText>
          </View>
        </Pressable>
      ) : (
        // Neutral, low-emphasis, timestamped. No icon, no colour, no alarm — there
        // is nothing here to act on, and dressing it up would spend the collector's
        // attention on good news.
        <View style={[styles.note, { borderColor: theme.border }]} accessible accessibilityRole="summary">
          <ThemedText type="small" themeColor="textSecondary">
            All records sent{claim?.kind === 'sent' ? ` · ${timeOfDay(claim.lastSync)}` : ''}. You&apos;ll
            need a connection to sign back in.
          </ThemedText>
        </View>
      )}

      <TwdButton
        label="Sign out"
        icon="log-out"
        variant="danger"
        onPress={confirmSignOut}
        accessibilityHint="Asks you to confirm before ending your session on this device"
      />
    </View>
  );
}

interface NavRowProps {
  icon: IconName;
  label: string;
  detail?: string;
  tone?: 'warning';
  onPress: () => void;
}

function NavRow({ icon, label, detail, tone, onPress }: NavRowProps) {
  const theme = useTwdTheme();
  const accent = tone === 'warning' ? theme.warning : theme.textSecondary;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={detail ? `${label}. ${detail}` : label}
      style={({ pressed }) => [
        styles.row,
        {
          borderColor: theme.border,
          backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
        },
      ]}>
      <Icon name={icon} size={22} color={accent} />
      <ThemedText type="defaultBold" style={styles.rowLabel}>
        {label}
      </ThemedText>
      {detail && (
        <ThemedText type="small" style={{ color: accent }} numberOfLines={1}>
          {detail}
        </ThemedText>
      )}
      <Icon name="chevron-right" size={18} color={theme.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: MIN_TAP_TARGET,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.card,
    borderWidth: 2,
  },
  rowLabel: { flex: 1 },
  card: { padding: Spacing.four, borderRadius: Radius.card, gap: Spacing.two },
  signOutSection: { gap: Spacing.three },
  warning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.card,
    borderWidth: 2,
  },
  warningText: { flex: 1, gap: Spacing.half },
  note: {
    padding: Spacing.three,
    borderRadius: Radius.card,
    borderWidth: 1,
  },
});
