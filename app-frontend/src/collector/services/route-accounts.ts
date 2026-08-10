import AsyncStorage from '@react-native-async-storage/async-storage';

import { OfflineStorage } from '@/collector/services/offline-storage';
import { localDateKey } from '@/shared/format/date';
import { apiFetch } from '@/shared/services/api-client';
import type { RouteAccount } from '@/shared/utils/billing-calculator';

/**
 * The collector's route, on the phone.
 *
 * The whole flow depends on this being local: the collector walks into a barangay
 * with no signal and has to open an account, see last month's reading, and bill
 * against it. Anything fetched at the point of use is a flow that stops working
 * where it is needed most, so the route is pulled while there is signal and read
 * from cache thereafter.
 *
 * ⚠️ This used to be twelve hard-coded households — "Carlos Garcia, 24 Mabini
 * Street" and friends — with a TODO promising a real endpoint. GET /accounts/route
 * now exists (app-backend/controllers/accountController.js) and the fixture is
 * deleted rather than kept as a fallback: a route screen that quietly falls back
 * to invented accounts is a collector knocking on a door that TWD does not bill,
 * and printing a receipt against a previous reading nobody recorded. An empty
 * route is a problem the collector can see and phone the office about; a plausible
 * fake one is not.
 */

/** Cache key kept from the fixture era so an installed handset keeps its route. */
const STORAGE_KEY = '@collector_route_accounts';
const SYNCED_AT_KEY = '@collector_route_preloaded_at';

/**
 * How long a cached route is served without trying the network again.
 *
 * Six hours is a shift. The route changes when the office links or disconnects a
 * meter — days apart, not minutes — so re-pulling on every focus would spend a
 * field handset's battery and data on an answer that is almost always identical.
 * Pull-to-refresh overrides it, and so does a cold cache.
 */
const STALE_MS = 6 * 60 * 60 * 1000;

/**
 * What the collector still has to do at this address.
 *
 * `pending` is deliberately not called "saved" — the reading exists, it is on this
 * phone, and TWD does not have it yet. That is a different fact from `done`, and
 * the collector is the only person who can tell the consumer which one is true.
 */
export type ReadingState = 'unread' | 'pending' | 'done';

export interface RouteAccountRow extends RouteAccount {
  state: ReadingState;
  /** Present once read. */
  currentReading?: number;
  consumption?: number;
}

export interface BarangaySummary {
  name: string;
  count: number;
}

/**
 * A route as the screen renders it, plus how much to trust it.
 *
 * `syncedAt` and `fromCache` are not diagnostics — they are the difference between
 * "these are your accounts" and "these are the accounts as of Tuesday". The screen
 * has to be able to say which, so the loader has to return which.
 */
export interface RouteSnapshot {
  rows: RouteAccountRow[];
  barangays: BarangaySummary[];
  /** Epoch ms of the last successful pull. Null means this phone has never had one. */
  syncedAt: number | null;
  /** True when the rows came off the cache because the network was not used or failed. */
  fromCache: boolean;
  /**
   * True when TWD was actually asked and could not be reached.
   *
   * Distinct from `fromCache`, which is also true in the ordinary case where the
   * cache was fresh enough that no request was made. Only this one means a pull
   * was attempted and lost — a pull-to-refresh that silently returns the same rows
   * is the app failing without saying so.
   */
  pullFailed: boolean;
}

interface RouteResponse {
  accounts: RouteAccount[];
  barangays: BarangaySummary[];
}

interface RouteCache {
  accounts: RouteAccount[];
  barangays: BarangaySummary[];
}

/** Older installs cached a bare array, before barangays existed. */
function parseCache(raw: string): RouteCache {
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return { accounts: parsed.map(normalise), barangays: [] };
  return {
    accounts: (parsed.accounts ?? []).map(normalise),
    barangays: parsed.barangays ?? [],
  };
}

/**
 * Fill in fields a cache written by an older build cannot have.
 *
 * Without this, an account cached before `barangay` existed groups under the
 * string "undefined" — a heading no barangay has, on a screen a collector uses to
 * decide where to walk.
 */
function normalise(account: RouteAccount): RouteAccount {
  return {
    ...account,
    // A row cached by an older build can carry the account number in place of a
    // name — that build sourced the route from `accounts`, where four rows had no
    // consumer behind them at all. Say so rather than repeating the number on both
    // lines of the card.
    consumerName:
      account.consumerName && account.consumerName !== account.accountNumber
        ? account.consumerName
        : 'Name not on file',
    consumerNo: account.consumerNo ?? null,
    barangay: account.barangay || 'Unassigned',
    meterNumber: account.meterNumber ?? '',
    lastReadingDate: account.lastReadingDate ?? null,
    status: account.status ?? 'active',
    connectionStatus: account.connectionStatus ?? null,
  };
}

function summarise(accounts: RouteAccount[]): BarangaySummary[] {
  const counts = new Map<string, number>();
  for (const account of accounts) {
    counts.set(account.barangay, (counts.get(account.barangay) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => {
      if (a.name === 'Unassigned') return 1;
      if (b.name === 'Unassigned') return -1;
      return a.name.localeCompare(b.name);
    });
}

export class RouteAccountService {
  /**
   * Pull the route from TWD and cache it. Throws if it cannot.
   *
   * Throwing is the point: the caller decides what an unreachable server means,
   * and for a collector in the field it usually means "carry on with what is on
   * the phone" — which is a decision that needs to know the pull failed.
   */
  static async pull(): Promise<RouteCache> {
    const { accounts, barangays } = await apiFetch<RouteResponse>('/accounts/route');
    const cache: RouteCache = { accounts: accounts.map(normalise), barangays };

    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
      await AsyncStorage.setItem(SYNCED_AT_KEY, Date.now().toString());
    } catch {
      // Cache write failed; the list this call returns is still good for the
      // session. Losing the cache costs the next cold start, not this one.
    }

    return cache;
  }

  /** The route saved on this phone. Empty — never invented — when there is none. */
  static async getCached(): Promise<RouteAccount[]> {
    return (await this.readCache()).accounts;
  }

  private static async readCache(): Promise<RouteCache> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) return parseCache(raw);
    } catch {
      // Corrupt cache reads as no cache.
    }
    return { accounts: [], barangays: [] };
  }

  static async syncedAt(): Promise<number | null> {
    try {
      const raw = await AsyncStorage.getItem(SYNCED_AT_KEY);
      const parsed = raw ? Number.parseInt(raw, 10) : NaN;
      return Number.isFinite(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  /**
   * The route as the list screen needs it: every account, grouped by barangay,
   * each carrying what the collector has already done to it today.
   *
   * The join happens here rather than in the screen because "has this been read?"
   * is a question about two stores — the route cache and the reading outbox — and
   * a screen that answers it inline gets it subtly wrong the moment a reading is
   * saved but not yet synced.
   */
  static async list({ force = false }: { force?: boolean } = {}): Promise<RouteSnapshot> {
    const before = await this.syncedAt();
    const stale = before === null || Date.now() - before > STALE_MS;

    let cache: RouteCache | null = null;
    let pullFailed = false;
    if (force || stale) {
      try {
        cache = await this.pull();
      } catch {
        pullFailed = true;
        // Offline, or TWD unreachable. The cached route from the depot is the
        // correct thing to work from — this is the expected case in the field,
        // not an error, and the snapshot reports it as `fromCache`.
      }
    }

    const fromCache = cache === null;
    if (!cache) cache = await this.readCache();

    const readings = await OfflineStorage.getMeterReadings();
    // Local, matching the stamp on the readings themselves. A UTC "today" here
    // showed a meter read at 7am as still Unread. See localDateKey.
    const today = localDateKey();
    const byAccount = new Map<
      string,
      { currentReading: number; consumption: number; synced: boolean }
    >();

    for (const r of readings) {
      /**
       * An earlier day's reading is dropped once TWD has it — the route is a day's
       * work, and a stop finished and filed last week starts clean.
       *
       * An *unsynced* one never is, whatever day it carries. It is still sitting in
       * this phone's outbox, which is the exact fact `pending` exists to state, and
       * dropping it here reset the stop to "Unread" the moment the clock passed
       * midnight. A collector who worked a barangay with no signal on Monday opened
       * the route on Tuesday to a list claiming none of it had been done — and the
       * "Pending sync" filter said 0 while the sync screen counted the same records
       * as waiting.
       *
       * The cost is not only the wrong label. Re-reading a meter appends a record
       * with a fresh clientId, and sync is idempotent on that id, so the second
       * reading is a new row at TWD rather than a correction of the first — two
       * readings for one meter, on the phone whose whole job is to record it once.
       */
      if (r.readingDate !== today && r.synced) continue;
      // Last write wins: a re-read of the same meter is a correction, and the
      // outbox is appended to in order, so the newest record is the last one seen.
      byAccount.set(r.accountNumber, {
        currentReading: r.currentReading,
        consumption: r.consumption,
        synced: r.synced,
      });
    }

    /**
     * Ordered by the server's walk sequence and never re-sorted by status.
     * Sorting the done ones to the bottom would look tidier and would also
     * reorder a physical walking path while someone is in the middle of it.
     */
    const rows = cache.accounts
      .map((account) => {
        const reading = byAccount.get(account.accountNumber);
        return {
          ...account,
          state: !reading ? 'unread' : reading.synced ? 'done' : 'pending',
          currentReading: reading?.currentReading,
          consumption: reading?.consumption,
        } satisfies RouteAccountRow;
      })
      .sort((a, b) => a.sequence - b.sequence);

    return {
      rows,
      // Falls back to a client-side count for a cache written before the server
      // sent a summary; the two agree, because both count the same list.
      barangays: cache.barangays.length ? cache.barangays : summarise(cache.accounts),
      syncedAt: fromCache ? before : await this.syncedAt(),
      fromCache,
      pullFailed,
    };
  }

  static async get(id: string): Promise<RouteAccountRow | null> {
    const { rows } = await this.list();
    return rows.find((r) => r.id === id) ?? null;
  }
}
