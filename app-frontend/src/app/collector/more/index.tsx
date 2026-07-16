import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth } from '@/constants/theme';
import { PrinterService } from '@/collector/services/printer-service';
import { SyncService } from '@/collector/services/sync-service';
import { useAuth, useSession } from '@/shared/auth/auth-context';
import { Icon, type IconName } from '@/shared/components/icon';
import { TwdButton } from '@/shared/components/twd-button';
import { useContentInsetsWithTopSpacing } from '@/shared/hooks/use-content-insets';
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
  const { signOut } = useAuth();
  const router = useRouter();
  const theme = useTwdTheme();
  const insets = useContentInsetsWithTopSpacing();

  const [unsynced, setUnsynced] = useState<number | null>(null);

  const loadUnsynced = useCallback(async () => {
    try {
      const status = await SyncService.getSyncStatus();
      const { meterReadings, collections, serviceOrders } = status.unsyncedCounts;
      setUnsynced(meterReadings + collections + serviceOrders);
    } catch {
      // Leave it null. An unknown count must not read as zero — see the guard in
      // confirmSignOut, which treats null as "assume there is work at risk".
      setUnsynced(null);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setState runs only after the await; see app/collector/index.tsx
    void loadUnsynced();
  }, [loadUnsynced]);

  /**
   * Sign-out is guarded by what it would actually cost, not by a generic caution.
   *
   * The old screen showed one static line — "avoid signing out mid-route" — in
   * muted grey, next to a button styled exactly like "Enroll a consumer account".
   * That warning is the same whether the collector has zero pending records or
   * forty, which makes it noise on the day it matters. Signing out clears secure
   * storage; anything not yet uploaded is gone. So the dialog states the number.
   *
   * `unsynced === null` means the count failed to load. That is treated as unsafe
   * rather than safe: the one thing worse than a spurious warning is a silent
   * sign-out that drops a shift's work.
   */
  const confirmSignOut = () => {
    const atRisk = unsynced === null || unsynced > 0;

    Alert.alert(
      atRisk ? 'Sign out and lose unsent work?' : 'Sign out?',
      atRisk
        ? `${
            unsynced === null
              ? 'Some records may still be saved on this device only.'
              : unsynced === 1
                ? '1 record is saved on this device and has not reached TWD.'
                : `${unsynced} records are saved on this device and have not reached TWD.`
          }\n\nSigning out clears this device's session and those records cannot be recovered. Connect to the internet and sync first if you can.`
        : "Everything is synced. You'll need a connection to sign back in.",
      [
        { text: 'Cancel', style: 'cancel' },
        ...(atRisk
          ? [{ text: 'Go to Sync', onPress: () => router.push('/collector/more/sync-status') }]
          : []),
        { text: 'Sign out', style: 'destructive' as const, onPress: () => void signOut() },
      ]
    );
  };

  return (
    <ThemedView style={styles.root}>
      <ScrollView contentContainerStyle={[styles.scroll, insets]}>
        <View style={styles.content}>
          <View style={styles.header}>
            <ThemedText type="subtitle">{session.user.name}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Collector · {session.user.routeIds?.join(', ') || 'No routes assigned'}
            </ThemedText>
          </View>

          <View style={styles.group}>
            <NavRow
              icon="refresh"
              label="Sync status"
              detail={
                unsynced === null
                  ? 'Unavailable'
                  : unsynced === 0
                    ? 'All records sent'
                    : `${unsynced} waiting`
              }
              tone={unsynced ? 'warning' : undefined}
              onPress={() => router.push('/collector/more/sync-status')}
            />
            <NavRow
              icon="printer"
              label="Printer"
              detail={PrinterService.isConnected() ? 'Connected' : 'Not connected'}
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
          </View>

          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="defaultBold">Session</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {sync === 'online'
                ? 'Connected. Your work syncs as you go.'
                : sync === 'offline'
                  ? 'No connection. Your work is saved on this device.'
                  : 'Sign-in not reconfirmed. Your work is saved on this device.'}
            </ThemedText>
          </ThemedView>

          <View style={styles.signOutSection}>
            <View
              style={[
                styles.warning,
                { borderColor: theme.danger, backgroundColor: theme.dangerSurface },
              ]}
              accessible
              accessibilityRole="summary">
              <Icon name="alert-triangle" size={20} color={theme.danger} />
              <ThemedText type="small" style={[styles.warningText, { color: theme.danger }]}>
                Signing out clears this device&apos;s saved session and any work that
                hasn&apos;t reached TWD. You&apos;ll need a connection to sign back in — avoid
                signing out mid-route.
              </ThemedText>
            </View>

            <TwdButton
              label="Sign out"
              variant="danger"
              onPress={confirmSignOut}
              accessibilityHint="Asks you to confirm before ending your session on this device"
            />
          </View>
        </View>
      </ScrollView>
    </ThemedView>
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
        <ThemedText type="small" style={{ color: accent }}>
          {detail}
        </ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1, alignItems: 'center', paddingHorizontal: Spacing.four },
  content: { width: '100%', maxWidth: MaxContentWidth, gap: Spacing.four },
  header: { gap: Spacing.one },
  group: { gap: Spacing.two },
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
  signOutSection: { gap: Spacing.three, marginTop: Spacing.two },
  warning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.card,
    borderWidth: 2,
  },
  warningText: { flex: 1 },
});
