import { OfflineStorage } from './offline-storage';
import { SyncService, type SyncStatus } from './sync-service';

export interface TodaySummary {
  readingsToday: number;
  collectionsToday: number;
  collectedToday: number;
  sync: SyncStatus;
}

/** Local calendar day, matching the `YYYY-MM-DD` the records are stamped with. */
function todayKey(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = `${now.getMonth() + 1}`.padStart(2, '0');
  const d = `${now.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * What this collector has done today, and where it stands with TWD.
 *
 * Every number here is read from this phone's own storage, which is the only
 * source that is true offline — and offline is the normal case, not the edge.
 *
 * Deliberately absent: "12 of 150". A progress bar needs a denominator, and the
 * denominator is the account roster for the collector's assigned routes, which
 * this app has never fetched or cached. `session.user.routeIds` gives the route
 * *ids* and nothing else; the only `totalAccounts` in the codebase lives in a mock
 * array inside reading-reports.tsx. Rendering "12 of 150" from that would put an
 * invented denominator in the most authoritative position on the dashboard, and it
 * would read as authoritative in exactly the demo where someone decides the number
 * is real. Counts are honest today; the ratio needs the roster cached at login
 * first, at which point this function grows a `routeTotal` and Home grows a bar.
 */
export async function loadToday(now: Date = new Date()): Promise<TodaySummary> {
  const key = todayKey(now);

  const [readings, collections, sync] = await Promise.all([
    OfflineStorage.getMeterReadings(),
    OfflineStorage.getCollections(),
    SyncService.getSyncStatus(),
  ]);

  const todayCollections = collections.filter((c) => c.collectionDate === key);

  return {
    readingsToday: readings.filter((r) => r.readingDate === key).length,
    collectionsToday: todayCollections.length,
    collectedToday: todayCollections.reduce((sum, c) => sum + c.amount, 0),
    sync,
  };
}

/**
 * How to talk about sync without overclaiming.
 *
 * `pending` is a count of records in this phone's outbox — knowable offline, and
 * the only sync fact that is always true.
 *
 * `lastSync` is the last time the outbox actually drained. It is the past tense on
 * purpose. The app cannot know that TWD *currently* holds everything; it can only
 * know that at 14:32 it sent everything it had, and that nothing has been queued
 * since. So the UI says "All records sent · 14:32", never a bare green "Synced" —
 * an adjective with no timestamp reads as a live guarantee, and there is no such
 * thing on a phone that spends its day out of signal.
 *
 * `never` (lastSync === 0) is its own case and is never reassuring: an empty
 * outbox that has never once been drained means nothing was ever recorded, or
 * something cleared the queue without sending. Both deserve the caution.
 */
export type SyncClaim =
  | { kind: 'pending'; count: number; lastSync: number }
  | { kind: 'sent'; lastSync: number }
  | { kind: 'never' };

export function syncClaim(status: SyncStatus): SyncClaim {
  const count =
    status.unsyncedCounts.meterReadings +
    status.unsyncedCounts.collections +
    status.unsyncedCounts.serviceOrders;

  if (count > 0) return { kind: 'pending', count, lastSync: status.lastSync };
  if (status.lastSync === 0) return { kind: 'never' };
  return { kind: 'sent', lastSync: status.lastSync };
}

/** "14:32" — a time, not a date. A collector cares about today's shift. */
export function timeOfDay(epochMs: number): string {
  const d = new Date(epochMs);
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();

  const hh = `${d.getHours()}`.padStart(2, '0');
  const mm = `${d.getMinutes()}`.padStart(2, '0');
  return sameDay ? `${hh}:${mm}` : `${d.toLocaleDateString()} ${hh}:${mm}`;
}
