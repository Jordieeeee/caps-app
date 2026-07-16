import { ScrollView, StyleSheet, View } from 'react-native';
import { useState, useEffect } from 'react';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { SyncService } from '@/collector/services/sync-service';
import { Icon, type IconName } from '@/shared/components/icon';
import { TwdButton } from '@/shared/components/twd-button';
import { useStackContentInsets } from '@/shared/hooks/use-content-insets';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { Radius } from '@/shared/theme/twd';
import NetInfo from '@react-native-community/netinfo';

/**
 * Sync detail. The navigation header supplies the title ("Sync Status"), so the
 * screen starts at the content — the old version printed its own 32px centred
 * title under the nav bar, saying the same thing twice with 128px of padding.
 */
export default function SyncStatusScreen() {
  const insets = useStackContentInsets();
  const theme = useTheme();
  const twd = useTwdTheme();

  const [isOnline, setIsOnline] = useState(false);
  const [syncStatus, setSyncStatus] = useState({
    hasUnsyncedData: false,
    lastSync: 0,
    unsyncedCounts: {
      meterReadings: 0,
      collections: 0,
      serviceOrders: 0,
    },
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ success: number; failed: number } | null>(null);

  const loadSyncStatus = async () => {
    const status = await SyncService.getSyncStatus();
    setSyncStatus(status);
  };

  useEffect(() => {
    // setState only after awaited I/O — same pattern as app/collector/index.tsx.
    void SyncService.getSyncStatus().then(setSyncStatus);
    void NetInfo.fetch().then((state) =>
      setIsOnline((state.isConnected && state.isInternetReachable) || false)
    );

    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline((state.isConnected && state.isInternetReachable) || false);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleForceSync = async () => {
    if (!isOnline) {
      return;
    }

    setIsSyncing(true);
    setSyncResult(null);

    try {
      const result = await SyncService.forceSyncNow();
      setSyncResult(result);
      await loadSyncStatus();
    } catch {
      setSyncResult({ success: 0, failed: 1 });
    } finally {
      setIsSyncing(false);
    }
  };

  const formatLastSync = (timestamp: number) => {
    if (timestamp === 0) {
      return 'Never';
    }
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const totalUnsynced =
    syncStatus.unsyncedCounts.meterReadings +
    syncStatus.unsyncedCounts.collections +
    syncStatus.unsyncedCounts.serviceOrders;

  return (
    <ScrollView
      style={[styles.scrollView, { backgroundColor: theme.background }]}
      contentContainerStyle={[styles.contentContainer, insets]}>
      <ThemedView style={styles.container}>
        <ThemedView style={styles.connectionContainer}>
          <ThemedView type="backgroundElement" style={styles.connectionCard}>
            <ThemedText type="small" themeColor="textSecondary">
              Connection
            </ThemedText>
            {/* Icon + word in a semantic tone — this was 🟢/🔴, a colour-only
                signal in someone else's artwork, announced to screen readers as
                "large green circle". */}
            <View style={styles.connectionStatus}>
              <Icon
                name={isOnline ? 'check' : 'cloud-off'}
                size={20}
                color={isOnline ? twd.success : twd.warning}
              />
              <ThemedText
                type="defaultBold"
                style={{ color: isOnline ? twd.success : twd.warning }}>
                {isOnline ? 'Online' : 'Offline'}
              </ThemedText>
            </View>
          </ThemedView>
          <ThemedView type="backgroundElement" style={styles.connectionCard}>
            <ThemedText type="small" themeColor="textSecondary">
              Last Sync
            </ThemedText>
            <ThemedText type="defaultBold" style={styles.lastSync} numberOfLines={2}>
              {formatLastSync(syncStatus.lastSync)}
            </ThemedText>
          </ThemedView>
        </ThemedView>

        <ThemedView style={styles.syncSummaryContainer}>
          <ThemedView type="backgroundElement" style={styles.syncSummaryCard}>
            <ThemedText type="small" themeColor="textSecondary">
              Records waiting to reach TWD
            </ThemedText>
            <ThemedText
              style={[
                styles.syncSummaryNumber,
                { color: totalUnsynced > 0 ? twd.warning : twd.success },
              ]}>
              {totalUnsynced}
            </ThemedText>
          </ThemedView>
        </ThemedView>

        <ThemedView style={styles.unsyncedContainer}>
          <ThemedText type="defaultBold" style={styles.sectionTitle}>
            Unsynced Data
          </ThemedText>

          <UnsyncedRow
            icon="gauge"
            label="Meter Readings"
            description="Offline meter reading records"
            count={syncStatus.unsyncedCounts.meterReadings}
          />
          <UnsyncedRow
            icon="banknote"
            label="Collections"
            description="Offline payment collection records"
            count={syncStatus.unsyncedCounts.collections}
          />
          <UnsyncedRow
            icon="file-check"
            label="Service Orders"
            description="Offline reconnection/disconnection records"
            count={syncStatus.unsyncedCounts.serviceOrders}
          />
        </ThemedView>

        <ThemedView style={styles.actionsContainer}>
          <TwdButton
            label="Sync Now"
            icon="refresh"
            busy={isSyncing}
            busyLabel="Syncing…"
            disabled={!isOnline}
            onPress={() => void handleForceSync()}
            style={styles.syncButton}
            accessibilityHint={
              isOnline ? 'Sends the records on this phone to TWD now' : 'Unavailable while offline'
            }
          />
          <TwdButton
            label="Refresh"
            variant="secondary"
            onPress={() => void loadSyncStatus()}
            style={styles.refreshButton}
          />
        </ThemedView>

        {/* The disabled Sync button alone doesn't say WHY it is disabled. */}
        {!isOnline && (
          <View
            style={[
              styles.offlineNote,
              { borderColor: twd.warning, backgroundColor: twd.warningSurface },
            ]}
            accessible
            accessibilityRole="summary">
            <Icon name="cloud-off" size={20} color={twd.warning} />
            <ThemedText type="small" style={[styles.offlineNoteText, { color: twd.warning }]}>
              Sync needs a connection. Your records are safe on this phone and will send
              automatically when signal returns.
            </ThemedText>
          </View>
        )}

        {syncResult && (
          <View
            style={[
              styles.resultCard,
              syncResult.failed > 0
                ? { borderColor: twd.danger, backgroundColor: twd.dangerSurface }
                : { borderColor: twd.success, backgroundColor: theme.backgroundElement },
            ]}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite">
            <Icon
              name={syncResult.failed > 0 ? 'alert-triangle' : 'check'}
              size={20}
              color={syncResult.failed > 0 ? twd.danger : twd.success}
            />
            <View style={styles.resultDetails}>
              <ThemedText
                type="defaultBold"
                style={{ color: syncResult.failed > 0 ? twd.danger : twd.success }}>
                {syncResult.failed > 0 ? 'Sync incomplete' : 'Sync complete'}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {syncResult.success} sent
                {syncResult.failed > 0
                  ? `, ${syncResult.failed} failed — those records are still saved on this phone. Try again when signal is stronger.`
                  : '.'}
              </ThemedText>
            </View>
          </View>
        )}

        <ThemedView type="backgroundElement" style={styles.infoBox}>
          <ThemedText type="defaultBold" style={styles.infoTitle}>
            How syncing works
          </ThemedText>
          <ThemedText type="small" style={styles.infoText}>
            • Data is automatically synced when internet connection is available
          </ThemedText>
          <ThemedText type="small" style={styles.infoText}>
            • All meter readings, collections, and service orders are stored locally
          </ThemedText>
          <ThemedText type="small" style={styles.infoText}>
            • Conflict resolution is handled server-side during sync
          </ThemedText>
          <ThemedText type="small" style={styles.infoText}>
            • Use &quot;Sync Now&quot; to send records without waiting
          </ThemedText>
        </ThemedView>
      </ThemedView>
    </ScrollView>
  );
}

interface UnsyncedRowProps {
  icon: IconName;
  label: string;
  description: string;
  count: number;
}

/**
 * One category of unsynced work. The count sits beside the label rather than in a
 * 36px banner beneath it — the emoji-era layout gave every zero its own card-height
 * headline.
 */
function UnsyncedRow({ icon, label, description, count }: UnsyncedRowProps) {
  const twd = useTwdTheme();

  return (
    <ThemedView type="backgroundElement" style={styles.unsyncedCard}>
      <Icon name={icon} size={24} color={count > 0 ? twd.warning : twd.textSecondary} />
      <View style={styles.unsyncedHeaderText}>
        <ThemedText type="defaultBold">{label}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {description}
        </ThemedText>
      </View>
      <ThemedText style={[styles.unsyncedCount, { color: count > 0 ? twd.warning : twd.success }]}>
        {count}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  container: {
    maxWidth: MaxContentWidth,
    flexGrow: 1,
  },
  connectionContainer: {
    flexDirection: 'row',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  connectionCard: {
    flex: 1,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
    alignItems: 'center',
  },
  connectionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  lastSync: {
    textAlign: 'center',
  },
  syncSummaryContainer: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  syncSummaryCard: {
    borderRadius: Spacing.three,
    padding: Spacing.four,
    gap: Spacing.one,
    alignItems: 'center',
  },
  syncSummaryNumber: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '700',
  },
  unsyncedContainer: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  sectionTitle: {
    fontSize: 16,
  },
  unsyncedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: Spacing.three,
    padding: Spacing.three,
  },
  unsyncedHeaderText: {
    flex: 1,
  },
  unsyncedCount: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
  },
  actionsContainer: {
    flexDirection: 'row',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  syncButton: {
    flex: 2,
  },
  refreshButton: {
    flex: 1,
  },
  offlineNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.four,
    padding: Spacing.three,
    borderRadius: Radius.card,
    borderWidth: 2,
  },
  offlineNoteText: {
    flex: 1,
  },
  resultCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.four,
    padding: Spacing.three,
    borderRadius: Radius.card,
    borderWidth: 2,
  },
  resultDetails: {
    flex: 1,
    gap: Spacing.one,
  },
  infoBox: {
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.four,
    borderRadius: Spacing.three,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  infoTitle: {
    fontSize: 16,
  },
  infoText: {
    lineHeight: 20,
  },
});
