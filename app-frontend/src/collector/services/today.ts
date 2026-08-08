import { localDateKey } from '@/shared/format/date';
import { OfflineStorage } from './offline-storage';
import { RouteAccountService } from './route-accounts';
import { SyncService, type SyncStatus } from './sync-service';

export interface TodaySummary {
  /** Readings recorded today. Records, not accounts — a re-read writes a second one. */
  readingsToday: number;
  /** Distinct accounts read today, which is what "progress along the route" means. */
  accountsRead: number;
  /** Accounts on the cached route. 0 when this phone has never downloaded one. */
  routeTotal: number;
  sync: SyncStatus;
}

/**
 * Local calendar day, matching the `YYYY-MM-DD` the records are stamped with.
 *
 * This file always had it right and was the only one that did — the stamping side
 * used `toISOString()`, so the two disagreed for the first eight hours of every
 * Manila day. Both ends now share one helper, which is the only way the pair can
 * be kept honest. See localDateKey.
 */
const todayKey = localDateKey;

/**
 * What this collector has done today, and where it stands with TWD.
 *
 * Every number here is read from this phone's own storage, which is the only
 * source that is true offline — and offline is the normal case, not the edge.
 *
 * "12 of 150" is now possible and is here. It was deliberately absent while the
 * denominator did not exist: the roster lived in a twelve-row mock and rendering a
 * ratio against it would have put an invented number in the most authoritative
 * position on the dashboard. GET /accounts/route now caches the real roster on the
 * handset, so the denominator is TWD's, and `routeTotal` is 0 — rendered as "not
 * downloaded", never as a ratio — when the phone has never had one.
 *
 * Deliberately absent, permanently: money. This used to report `collectedToday`
 * and a count of payments, from a store nothing ever wrote, so Home showed a
 * collector "₱0.00 collected · 0 payments" every day of their working life. TWD's
 * collectors read meters; a consumer pays at the office. See offline-storage.ts.
 */
export async function loadToday(now: Date = new Date()): Promise<TodaySummary> {
  const key = todayKey(now);

  const [readings, route, sync] = await Promise.all([
    OfflineStorage.getMeterReadings(),
    // Cache only — no network. This runs on every Home focus, and Home must render
    // the same numbers in a barangay with no signal as it does at the depot.
    RouteAccountService.getCached(),
    SyncService.getSyncStatus(),
  ]);

  const todayReadings = readings.filter((r) => r.readingDate === key);

  return {
    readingsToday: todayReadings.length,
    // Distinct accounts: re-reading a meter to correct it writes a second record,
    // and it would be wrong to tell someone they have read 15 of 12 accounts.
    accountsRead: new Set(todayReadings.map((r) => r.accountNumber)).size,
    routeTotal: route.length,
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
  const count = status.unsyncedCounts.meterReadings + status.unsyncedCounts.serviceOrders;

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
