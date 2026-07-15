import NetInfo from '@react-native-community/netinfo';
import { OfflineStorage } from './offline-storage';

export class SyncService {
  private static isSyncing = false;
  private static syncInterval: NodeJS.Timeout | null = null;

  // Start automatic sync monitoring
  static startSyncMonitoring(intervalMs: number = 30000): void {
    if (this.syncInterval) {
      return; // Already monitoring
    }

    this.syncInterval = setInterval(() => {
      this.checkAndSync();
    }, intervalMs);
  }

  // Stop automatic sync monitoring
  static stopSyncMonitoring(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  // Check connectivity and sync if online
  static async checkAndSync(): Promise<void> {
    if (this.isSyncing) {
      return; // Already syncing
    }

    try {
      const netInfo = await NetInfo.fetch();
      
      if (netInfo.isConnected && netInfo.isInternetReachable) {
        await this.syncAll();
      }
    } catch (error) {
      console.error('Error checking connectivity:', error);
    }
  }

  // Manual sync trigger
  static async syncAll(): Promise<{ success: number; failed: number }> {
    if (this.isSyncing) {
      throw new Error('Sync already in progress');
    }

    this.isSyncing = true;
    let success = 0;
    let failed = 0;

    try {
      // Sync meter readings
      const readingsResult = await this.syncMeterReadings();
      success += readingsResult.success;
      failed += readingsResult.failed;

      // Sync collections
      const collectionsResult = await this.syncCollections();
      success += collectionsResult.success;
      failed += collectionsResult.failed;

      // Sync service orders
      const ordersResult = await this.syncServiceOrders();
      success += ordersResult.success;
      failed += ordersResult.failed;

      // Update last sync timestamp
      await OfflineStorage.updateLastSyncTimestamp();

      // Clear sync queue if all succeeded
      if (failed === 0) {
        await OfflineStorage.clearSyncQueue();
      }

      return { success, failed };
    } catch (error) {
      console.error('Error during sync:', error);
      throw error;
    } finally {
      this.isSyncing = false;
    }
  }

  private static async syncMeterReadings(): Promise<{ success: number; failed: number }> {
    const unsynced = await OfflineStorage.getUnsyncedMeterReadings();
    let success = 0;
    let failed = 0;

    for (const reading of unsynced) {
      try {
        // TODO: Replace with actual API call
        // const response = await api.post('/meter-readings', reading);
        
        // Simulate API call
        await this.simulateApiCall();
        
        await OfflineStorage.markMeterReadingSynced(reading.id);
        success++;
      } catch (error) {
        console.error(`Error syncing meter reading ${reading.id}:`, error);
        failed++;
      }
    }

    return { success, failed };
  }

  private static async syncCollections(): Promise<{ success: number; failed: number }> {
    const unsynced = await OfflineStorage.getUnsyncedCollections();
    let success = 0;
    let failed = 0;

    for (const collection of unsynced) {
      try {
        // TODO: Replace with actual API call
        // const response = await api.post('/collections', collection);
        
        // Simulate API call
        await this.simulateApiCall();
        
        await OfflineStorage.markCollectionSynced(collection.id);
        success++;
      } catch (error) {
        console.error(`Error syncing collection ${collection.id}:`, error);
        failed++;
      }
    }

    return { success, failed };
  }

  private static async syncServiceOrders(): Promise<{ success: number; failed: number }> {
    const unssynced = await OfflineStorage.getUnsyncedServiceOrders();
    let success = 0;
    let failed = 0;

    for (const order of unsynced) {
      try {
        // TODO: Replace with actual API call
        // const response = await api.post('/service-orders', order);
        
        // Simulate API call
        await this.simulateApiCall();
        
        await OfflineStorage.markServiceOrderSynced(order.id);
        success++;
      } catch (error) {
        console.error(`Error syncing service order ${order.id}:`, error);
        failed++;
      }
    }

    return { success, failed };
  }

  // Simulate API call for testing
  private static async simulateApiCall(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 100));
  }

  // Get sync status
  static async getSyncStatus(): Promise<{
    hasUnsyncedData: boolean;
    lastSync: number;
    unsyncedCounts: {
      meterReadings: number;
      collections: number;
      serviceOrders: number;
    };
  }> {
    const lastSync = await OfflineStorage.getLastSyncTimestamp();
    const unsyncedMeterReadings = await OfflineStorage.getUnsyncedMeterReadings();
    const unsyncedCollections = await OfflineStorage.getUnsyncedCollections();
    const unssyncedServiceOrders = await OfflineStorage.getUnsyncedServiceOrders();

    const hasUnsyncedData = 
      unsyncedMeterReadings.length > 0 ||
      unsyncedCollections.length > 0 ||
      unssyncedServiceOrders.length > 0;

    return {
      hasUnsyncedData,
      lastSync,
      unsyncedCounts: {
        meterReadings: unsyncedMeterReadings.length,
        collections: unsyncedCollections.length,
        serviceOrders: unssyncedServiceOrders.length,
      },
    };
  }

  // Force immediate sync (user-triggered)
  static async forceSyncNow(): Promise<{ success: number; failed: number }> {
    const netInfo = await NetInfo.fetch();
    
    if (!netInfo.isConnected || !netInfo.isInternetReachable) {
      throw new Error('No internet connection available');
    }

    return this.syncAll();
  }
}
