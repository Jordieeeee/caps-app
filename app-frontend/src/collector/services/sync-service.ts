import NetInfo from '@react-native-community/netinfo';

import { apiFetch } from '@/shared/services/api-client';
import { OfflineStorage } from './offline-storage';

export interface SyncStatus {
  hasUnsyncedData: boolean;
  /** Epoch ms of the last sync that drained the outbox. 0 = never. */
  lastSync: number;
  unsyncedCounts: {
    meterReadings: number;
    serviceOrders: number;
  };
}

export interface SyncResult {
  success: number;
  failed: number;
}

/**
 * A reading as `GET /readings` returns it.
 *
 * Separate from the local `MeterReading` because the two genuinely differ: the
 * server keys on `clientId` and stamps its own `createdAt`, while the phone keys on
 * `id` and carries `synced`. Mapping between them explicitly is what keeps a server
 * field from silently becoming a local one it does not mean.
 */
interface ServerReading {
  clientId: string;
  routeId?: string;
  collectorId?: string;
  accountNumber: string;
  previousReading: number;
  currentReading: number;
  consumption: number;
  readingDate: string;
  clientTimestamp?: number;
  createdAt: string;
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
 * The real calls below are POSTs to the /sync endpoints, which were ready and
 * idempotent the whole time: each requires a `clientId`, is uniquely indexed on
 * it, and upserts rather than inserts, so replaying a queue after a lost response
 * cannot duplicate a reading. `collectorId` is deliberately not sent — the server
 * takes it from the auth token rather than trusting us.
 *
 * There were three queues; there are two. Cash collections are gone from this app
 * entirely — TWD's collectors read meters and do not take payment — so there is no
 * money leaving a handset for this class to be careful with.
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

  /**
   * Pull this collector's own readings back down from TWD.
   *
   * THE ONE DIRECTION THIS CLASS NEVER TRAVELLED. Every history screen a collector
   * has — Daily Summary, Reports, the billing periods behind them — reads
   * `OfflineStorage` and nothing else, which is correct offline and quietly wrong
   * after a reinstall: the records are safely on the server, the phone has none of
   * them, and the collector is shown an empty working life. A factory reset, a
   * replacement handset or a second phone all land in the same place.
   *
   * Three conditions, and each one is load-bearing:
   *
   *   1. **The outbox must be empty.** If anything is still waiting to upload, this
   *      does nothing at all. A phone holding unsent work is the authority on that
   *      work, and merging a server list into it while `syncAll` may be walking the
   *      same store is how two writers end up interleaving on one AsyncStorage key.
   *   2. **Only ids the phone has never seen** are added — enforced in
   *      `mergeSyncedMeterReadings`, so nothing here can overwrite a local record.
   *   3. **Everything it adds is already synced**, by definition: the server just
   *      sent it. They are not queued for upload.
   *
   * `GET /readings` is scoped server-side to the calling collector (see
   * app-backend/controllers/meterReadingController.js), so there is no collectorId
   * to pass and no way to ask for somebody else's route.
   *
   * Returns the number of records recovered. Silent on failure: this runs on session
   * start, a collector did not ask for it, and a phone that already has its history
   * has nothing to report.
   */
  static async hydrateHistory(): Promise<number> {
    try {
      const pending = await OfflineStorage.getUnsyncedMeterReadings();
      if (pending.length > 0) return 0;

      const netInfo = await NetInfo.fetch();
      if (!netInfo.isConnected || !netInfo.isInternetReachable) return 0;

      const { readings } = await apiFetch<{ readings: ServerReading[] }>('/readings');

      return await OfflineStorage.mergeSyncedMeterReadings(
        readings
          // A record with no clientId predates the offline app and has no id this
          // phone can dedupe on — skipped rather than given a synthetic one, which
          // would re-add it on every launch.
          .filter((r) => Boolean(r.clientId))
          .map((r) => ({
            id: r.clientId,
            routeId: r.routeId ?? '',
            collectorId: r.collectorId ?? '',
            accountNumber: r.accountNumber,
            previousReading: r.previousReading,
            currentReading: r.currentReading,
            consumption: r.consumption,
            readingDate: r.readingDate,
            // The moment the reading was taken, not the moment it reached TWD.
            // `createdAt` is the server's clock and would re-order a route by when
            // signal came back rather than by when the collector walked it.
            timestamp: r.clientTimestamp ?? (Date.parse(r.createdAt) || 0),
            synced: true,
          }))
      );
    } catch {
      // Offline, unauthorised, or the endpoint is unreachable. The phone keeps
      // whatever it already had, which is the state it was in a moment ago.
      return 0;
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
            /**
             * When the collector took the reading, on their phone's clock.
             *
             * `MeterReading.clientTimestamp` has existed in the schema all along and
             * nothing ever sent it, so every stored reading carries only the
             * server's `createdAt` — the moment signal came back, which for a
             * collector working a barangay offline can be hours later and in a
             * different order than the route was walked. It did not matter while
             * nothing read the records back; `hydrateHistory` below now does, and a
             * recovered history sorted by when the phone found a signal is not the
             * collector's day.
             */
            clientTimestamp: reading.timestamp,
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
    const [lastSync, readings, orders] = await Promise.all([
      OfflineStorage.getLastSyncTimestamp(),
      OfflineStorage.getUnsyncedMeterReadings(),
      OfflineStorage.getUnsyncedServiceOrders(),
    ]);

    return {
      hasUnsyncedData: readings.length > 0 || orders.length > 0,
      lastSync,
      unsyncedCounts: {
        meterReadings: readings.length,
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
