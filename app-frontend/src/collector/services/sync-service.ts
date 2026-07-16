import NetInfo from '@react-native-community/netinfo';

import { apiFetch } from '@/shared/services/api-client';
import { OfflineStorage } from './offline-storage';

export interface SyncStatus {
  hasUnsyncedData: boolean;
  /** Epoch ms of the last sync that drained the outbox. 0 = never. */
  lastSync: number;
  unsyncedCounts: {
    meterReadings: number;
    collections: number;
    serviceOrders: number;
  };
}

export interface SyncResult {
  success: number;
  failed: number;
}

/**
 * Moves records off this phone and onto TWD's server.
 *
 * ⚠️ THIS USED TO SEND NOTHING. Every path was:
 *
 *     // TODO: Replace with actual API call
 *     // const response = await api.post('/meter-readings', reading);
 *     await this.simulateApiCall();            // setTimeout(resolve, 100)
 *     await OfflineStorage.markMeterReadingSynced(reading.id);
 *
 * — a 100ms sleep, then the record was marked synced. "Force Sync Now" reported
 * "3 sent, 0 failed", the pending count fell to zero, and the UI told the
 * collector their shift was safely with TWD while it existed only in AsyncStorage
 * on one phone. Every status indicator downstream inherited that lie, including
 * the one guarding sign-out, which clears the session and the storage with it.
 *
 * The real calls below are POSTs to the three /sync endpoints, which were ready
 * and idempotent the whole time: each requires a `clientId`, is uniquely indexed
 * on it, and upserts rather than inserts, so replaying a queue after a lost
 * response cannot duplicate a reading or a payment. `collectorId` is deliberately
 * not sent — the server takes it from the auth token rather than trusting us.
 *
 * The honesty rule this class now owns: a record is marked synced only after the
 * server has acknowledged it, and `lastSync` advances only when the outbox
 * actually drained. Everything the UI claims about sync is downstream of those two
 * facts, so they must not be generous.
 */
export class SyncService {
  private static isSyncing = false;
  // NodeJS.Timeout isn't available in React Native's type environment; setInterval
  // here returns the RN timer handle.
  private static syncInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Begin opportunistic background sync.
   *
   * Nothing called this before, on any screen, which meant records only moved when
   * a collector found the Sync tab and tapped a button — while the app told them
   * "Connected. Your work syncs as you go." It is started by the collector shell
   * now, so the claim is true for as long as a collector session is mounted.
   */
  static startSyncMonitoring(intervalMs: number = 30000): void {
    if (this.syncInterval) {
      return; // Already monitoring
    }

    this.syncInterval = setInterval(() => {
      void this.checkAndSync();
    }, intervalMs);
  }

  static stopSyncMonitoring(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  /** Sync if there is signal. Silent by design — this runs on a timer. */
  static async checkAndSync(): Promise<void> {
    if (this.isSyncing) {
      return;
    }

    try {
      const netInfo = await NetInfo.fetch();
      if (netInfo.isConnected && netInfo.isInternetReachable) {
        await this.syncAll();
      }
    } catch {
      // Opportunistic: a failed background attempt is not news. The pending count
      // stays visible on Home and Sync Status, which is where a collector learns
      // that records have not moved.
    }
  }

  static async syncAll(): Promise<SyncResult> {
    if (this.isSyncing) {
      throw new Error('Sync already in progress');
    }

    this.isSyncing = true;
    let success = 0;
    let failed = 0;

    try {
      for (const result of [
        await this.syncMeterReadings(),
        await this.syncCollections(),
        await this.syncServiceOrders(),
      ]) {
        success += result.success;
        failed += result.failed;
      }

      // Only when the outbox genuinely drained. This used to run unconditionally,
      // so a sync where every record failed still stamped "last synced: now" — the
      // timestamp said we had reached TWD at the moment we most clearly had not.
      if (failed === 0) {
        await OfflineStorage.updateLastSyncTimestamp();
        await OfflineStorage.clearSyncQueue();
      }

      return { success, failed };
    } finally {
      this.isSyncing = false;
    }
  }

  private static async syncMeterReadings(): Promise<SyncResult> {
    const unsynced = await OfflineStorage.getUnsyncedMeterReadings();
    let success = 0;
    let failed = 0;

    for (const reading of unsynced) {
      try {
        await apiFetch('/readings/sync', {
          method: 'POST',
          body: JSON.stringify({
            clientId: reading.id,
            routeId: reading.routeId,
            accountNumber: reading.accountNumber,
            previousReading: reading.previousReading,
            currentReading: reading.currentReading,
            readingDate: reading.readingDate,
          }),
        });
        // Only after the server acknowledged. If this line is ever moved above the
        // await, the record is lost the moment the collector signs out.
        await OfflineStorage.markMeterReadingSynced(reading.id);
        success++;
      } catch {
        failed++;
      }
    }

    return { success, failed };
  }

  private static async syncCollections(): Promise<SyncResult> {
    const unsynced = await OfflineStorage.getUnsyncedCollections();
    let success = 0;
    let failed = 0;

    for (const collection of unsynced) {
      try {
        await apiFetch('/collections/sync', {
          method: 'POST',
          body: JSON.stringify({
            clientId: collection.id,
            accountNumber: collection.accountNumber,
            amount: collection.amount,
            paymentMethod: collection.paymentMethod,
            collectionDate: collection.collectionDate,
          }),
        });
        await OfflineStorage.markCollectionSynced(collection.id);
        success++;
      } catch {
        failed++;
      }
    }

    return { success, failed };
  }

  private static async syncServiceOrders(): Promise<SyncResult> {
    const unsynced = await OfflineStorage.getUnsyncedServiceOrders();
    let success = 0;
    let failed = 0;

    for (const order of unsynced) {
      try {
        await apiFetch('/service-orders/sync', {
          method: 'POST',
          body: JSON.stringify({
            clientId: order.id,
            type: order.type,
            accountNumber: order.accountNumber,
            accountAddress: order.accountAddress,
            reason: order.reason,
            status: order.status,
            fieldVerification: order.fieldVerification,
            completionDate: order.completionDate,
          }),
        });
        await OfflineStorage.markServiceOrderSynced(order.id);
        success++;
      } catch {
        failed++;
      }
    }

    return { success, failed };
  }

  static async getSyncStatus(): Promise<SyncStatus> {
    const [lastSync, readings, collections, orders] = await Promise.all([
      OfflineStorage.getLastSyncTimestamp(),
      OfflineStorage.getUnsyncedMeterReadings(),
      OfflineStorage.getUnsyncedCollections(),
      OfflineStorage.getUnsyncedServiceOrders(),
    ]);

    return {
      hasUnsyncedData: readings.length > 0 || collections.length > 0 || orders.length > 0,
      lastSync,
      unsyncedCounts: {
        meterReadings: readings.length,
        collections: collections.length,
        serviceOrders: orders.length,
      },
    };
  }

  static async forceSyncNow(): Promise<SyncResult> {
    const netInfo = await NetInfo.fetch();

    if (!netInfo.isConnected || !netInfo.isInternetReachable) {
      throw new Error('No internet connection available');
    }

    return this.syncAll();
  }
}
