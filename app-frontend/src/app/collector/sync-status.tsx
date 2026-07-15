import { Platform, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { SyncService } from '@/collector/services/sync-service';
import NetInfo from '@react-native-community/netinfo';

export default function SyncStatusScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const insets = {
    ...safeAreaInsets,
    bottom: safeAreaInsets.bottom + BottomTabInset + Spacing.three,
  };
  const theme = useTheme();
  
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

  const contentPlatformStyle = Platform.select({
    android: {
      paddingTop: insets.top,
      paddingLeft: insets.left,
      paddingRight: insets.right,
      paddingBottom: insets.bottom,
    },
    web: {
      paddingTop: Spacing.six,
      paddingBottom: Spacing.four,
    },
  });

  useEffect(() => {
    loadSyncStatus();
    checkConnectivity();

    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline(state.isConnected && state.isInternetReachable || false);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const checkConnectivity = async () => {
    const state = await NetInfo.fetch();
    setIsOnline(state.isConnected && state.isInternetReachable || false);
  };

  const loadSyncStatus = async () => {
    const status = await SyncService.getSyncStatus();
    setSyncStatus(status);
  };

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
    } catch (error) {
      console.error('Sync failed:', error);
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
      contentInset={insets}
      contentContainerStyle={[styles.contentContainer, contentPlatformStyle]}>
      <ThemedView style={styles.container}>
        <ThemedView style={styles.titleContainer}>
          <ThemedText type="subtitle">Sync Status</ThemedText>
          <ThemedText style={styles.centerText} themeColor="textSecondary">
            Monitor data synchronization and offline storage status.
          </ThemedText>
        </ThemedView>

        <ThemedView style={styles.connectionContainer}>
          <ThemedView type="backgroundElement" style={styles.connectionCard}>
            <ThemedText type="small" themeColor="textSecondary">
              Connection Status
            </ThemedText>
            <ThemedView style={styles.connectionStatus}>
              <ThemedText style={styles.connectionIcon}>
                {isOnline ? '🟢' : '🔴'}
              </ThemedText>
              <ThemedText type="defaultBold" style={{ color: isOnline ? '#34C759' : '#FF3B30' }}>
                {isOnline ? 'Online' : 'Offline'}
              </ThemedText>
            </ThemedView>
          </ThemedView>
          <ThemedView type="backgroundElement" style={styles.connectionCard}>
            <ThemedText type="small" themeColor="textSecondary">
              Last Sync
            </ThemedText>
            <ThemedText type="defaultBold">
              {formatLastSync(syncStatus.lastSync)}
            </ThemedText>
          </ThemedView>
        </ThemedView>

        <ThemedView style={styles.syncSummaryContainer}>
          <ThemedView type="backgroundElement" style={styles.syncSummaryCard}>
            <ThemedText type="small" themeColor="textSecondary">
              Total Unsynced Items
            </ThemedText>
            <ThemedText 
              type="title" 
              style={[
                styles.syncSummaryNumber,
                { color: totalUnsynced > 0 ? '#FF9500' : '#34C759' }
              ]}>
              {totalUnsynced}
            </ThemedText>
          </ThemedView>
        </ThemedView>

        <ThemedView style={styles.unsyncedContainer}>
          <ThemedText type="defaultBold" style={styles.sectionTitle}>
            Unsynced Data
          </ThemedText>
          
          <ThemedView type="backgroundElement" style={styles.unsyncedCard}>
            <ThemedView style={styles.unsyncedCardHeader}>
              <ThemedText style={styles.unsyncedIcon}>📊</ThemedText>
              <ThemedView style={styles.unsyncedHeaderText}>
                <ThemedText type="defaultBold">Meter Readings</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Offline meter reading records
                </ThemedText>
              </ThemedView>
            </ThemedView>
            <ThemedText type="title" style={styles.unsyncedCount}>
              {syncStatus.unsyncedCounts.meterReadings}
            </ThemedText>
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.unsyncedCard}>
            <ThemedView style={styles.unsyncedCardHeader}>
              <ThemedText style={styles.unsyncedIcon}>💰</ThemedText>
              <ThemedView style={styles.unsyncedHeaderText}>
                <ThemedText type="defaultBold">Collections</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Offline payment collection records
                </ThemedText>
              </ThemedView>
            </ThemedView>
            <ThemedText type="title" style={styles.unsyncedCount}>
              {syncStatus.unsyncedCounts.collections}
            </ThemedText>
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.unsyncedCard}>
            <ThemedView style={styles.unsyncedCardHeader}>
              <ThemedText style={styles.unsyncedIcon}>🔧</ThemedText>
              <ThemedView style={styles.unsyncedHeaderText}>
                <ThemedText type="defaultBold">Service Orders</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Offline reconnection/disconnection records
                </ThemedText>
              </ThemedView>
            </ThemedView>
            <ThemedText type="title" style={styles.unsyncedCount}>
              {syncStatus.unsyncedCounts.serviceOrders}
            </ThemedText>
          </ThemedView>
        </ThemedView>

        <ThemedView style={styles.actionsContainer}>
          <TouchableOpacity
            style={[
              styles.syncButton,
              {
                backgroundColor: isOnline 
                  ? theme.backgroundElement 
                  : theme.textSecondary + '40',
              },
            ]}
            onPress={handleForceSync}
            disabled={!isOnline || isSyncing}>
            <ThemedText 
              type="defaultBold"
              style={{
                color: isOnline ? theme.text : theme.textSecondary,
              }}>
              {isSyncing ? 'Syncing...' : 'Force Sync Now'}
            </ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.refreshButton, { backgroundColor: theme.backgroundElement }]}
            onPress={loadSyncStatus}>
            <ThemedText type="defaultBold">🔄 Refresh Status</ThemedText>
          </TouchableOpacity>
        </ThemedView>

        {syncResult && (
          <ThemedView 
            type="backgroundElement" 
            style={[
              styles.resultCard,
              { backgroundColor: syncResult.failed > 0 ? '#FF3B3020' : '#34C75920' },
            ]}>
            <ThemedText type="defaultBold" style={styles.resultTitle}>
              Sync Result
            </ThemedText>
            <ThemedView style={styles.resultDetails}>
              <ThemedText type="small" style={{ color: '#34C759' }}>
                ✓ Success: {syncResult.success}
              </ThemedText>
              {syncResult.failed > 0 && (
                <ThemedText type="small" style={{ color: '#FF3B30' }}>
                  ✗ Failed: {syncResult.failed}
                </ThemedText>
              )}
            </ThemedView>
          </ThemedView>
        )}

        <ThemedView type="backgroundElement" style={styles.infoBox}>
          <ThemedText type="defaultBold" style={styles.infoTitle}>
            ℹ️ Sync Information
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
            • Use "Force Sync Now" to manually trigger synchronization
          </ThemedText>
        </ThemedView>
      </ThemedView>
    </ScrollView>
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
  titleContainer: {
    gap: Spacing.three,
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.six,
  },
  centerText: {
    textAlign: 'center',
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
    padding: Spacing.four,
    alignItems: 'center',
  },
  connectionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  connectionIcon: {
    fontSize: 20,
  },
  syncSummaryContainer: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  syncSummaryCard: {
    borderRadius: Spacing.three,
    padding: Spacing.four,
    alignItems: 'center',
  },
  syncSummaryNumber: {
    fontSize: 32,
    fontWeight: 'bold',
  },
  unsyncedContainer: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  sectionTitle: {
    fontSize: 16,
    marginBottom: Spacing.two,
  },
  unsyncedCard: {
    borderRadius: Spacing.three,
    padding: Spacing.four,
  },
  unsyncedCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  unsyncedIcon: {
    fontSize: 32,
  },
  unsyncedHeaderText: {
    flex: 1,
  },
  unsyncedCount: {
    fontSize: 36,
    fontWeight: 'bold',
    marginTop: Spacing.two,
  },
  actionsContainer: {
    flexDirection: 'row',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  syncButton: {
    flex: 2,
    borderRadius: Spacing.three,
    padding: Spacing.four,
    alignItems: 'center',
  },
  refreshButton: {
    flex: 1,
    borderRadius: Spacing.three,
    padding: Spacing.four,
    alignItems: 'center',
  },
  resultCard: {
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.four,
    borderRadius: Spacing.three,
    padding: Spacing.four,
  },
  resultTitle: {
    fontSize: 16,
    marginBottom: Spacing.two,
  },
  resultDetails: {
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
