import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { usePrinter } from '@/collector/services/printer-state';
import { SyncService } from '@/collector/services/sync-service';
import { syncClaim, timeOfDay, type SyncClaim } from '@/collector/services/today';
import { useCollectorIdentity } from '@/collector/collector-identity';
import { Icon, type IconName } from '@/shared/components/icon';
import { ScreenContainer, ScreenSection } from '@/shared/components/screen-container';
import { ScreenHeader } from '@/shared/components/screen-header';
import { ThemeToggle } from '@/shared/components/theme-toggle';
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
  const { collector, sync } = useCollectorIdentity();
  const { state, refresh, refreshing } = useAsync(useCallback(() => SyncService.getSyncStatus(), []));
  const router = useRouter();
  const printer = usePrinter();

  // An unknown count is treated as unsafe, never as zero. The one thing worse than
  // a spurious warning is a silent sign-out that drops a shift's work.
  const claim: SyncClaim | null = state.status === 'ready' ? syncClaim(state.data) : null;

  // `variant="stack"`, not the default `tab`. more/_layout.tsx sets
  // `headerShown: true` for this screen, so the navigation header has already
  // absorbed the top safe area. The default variant adds `safeArea.top` again as
  // content padding, counting the notch twice — ~83pt of dead space under the
  // header divider on a Dynamic Island device (59 absorbed + 59 re-added + 24).
  return (
    <ScreenContainer variant="stack" onRefresh={() => void refresh()} refreshing={refreshing}>
      <ScreenHeader
        title={collector.name}
        subtitle={`Collector · ${collector.routeIds.join(', ') || 'No routes assigned'}`}
      />

      <ScreenSection gap={Spacing.two}>
        {/* First row, above the operational ones, because it is the only one that
            answers "is the app wrong, or is my record wrong?" — and because the
            header above it is the *session's* copy of a name that can be ninety
            days old. See collector/services/collector-profile.ts. */}
        <NavRow
          icon="user"
          label="Account"
          detail={collector.employeeId ?? 'Your TWD details'}
          onPress={() => router.push('/collector/more/account')}
        />
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
        {/* Reconnections and disconnections were here. They are on the Route screen
            now — they are work done at an address on the round, and reaching them
            meant leaving the route, opening a hub built for sync detail and signing
            out, and coming back. See collector/reading-reports/index.tsx. */}
      </ScreenSection>

      {/* Appearance sits above Session and below the navigation rows: it is a
          setting, not a destination, so it does not deserve a row that pushes a
          screen — and a collector standing in the sun who needs the light theme
          needs it in one tap, not two. */}
      <ScreenSection gap={Spacing.two}>
        <ThemedText type="defaultBold">Appearance</ThemedText>
        <ThemeToggle />
        <ThemedText type="small" themeColor="textSecondary">
          Dark is hard to read in direct sunlight. Set Light for a daytime round and this
          phone will keep it, whatever the phone&apos;s own schedule says.
        </ThemedText>
      </ScreenSection>

      {/* Sign out was here, under this card. It lives on the Account screen now —
          one push away, beside the employment record it ends a session for, and
          in the same place the consumer app keeps it. This hub is a list of
          destinations; the one irreversible action in the collector app should not
          sit at the bottom of a list someone scrolls to reach the Printer. The
          unsent-work warning went with it: that warning is part of the button, not
          part of this screen. See collector/components/sign-out-block.tsx. */}
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
      </ScreenSection>
    </ScreenContainer>
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
});
