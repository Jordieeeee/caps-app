import AsyncStorage from '@react-native-async-storage/async-storage';

import { OfflineStorage } from '@/collector/services/offline-storage';
import { localDateKey } from '@/shared/format/date';
import { apiFetch } from '@/shared/services/api-client';
import type { RateSchedule, RateSchedules, RouteAccount } from '@/shared/utils/billing-calculator';

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
/** Set when this phone changes something the route describes. See `invalidate`. */
const REFRESH_KEY = '@collector_route_needs_refresh';

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
  /**
   * The district's tariff for THIS stop's classification, resolved from the cached
   * route. Undefined where the cache predates rates being served, or where the
   * district has no schedule for this account's type — `calculateBill` then falls
   * back to the app's placeholder table, and the screen says which it used.
   */
  rates?: RateSchedule;
}

/**
 * The schedule that applies to one stop.
 *
 * Keyed on the district's own `accountType`, falling back to the receipt's
 * `rateClass` lowercased — the two agree by construction (see `RATE_CLASS` in
 * app-backend/controllers/accountController.js) and the fallback only matters for a
 * row cached before `accountType` was sent.
 */
function ratesFor(
  rates: RateSchedules | undefined,
  account: RouteAccount
): RateSchedule | undefined {
  if (!rates) return undefined;
  const key = (account.accountType || account.rateClass || '').toLowerCase();
  return key ? rates[key] : undefined;
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
  /**
   * Which zone's round this is, or undefined for a cache written before the server
   * scoped routes at all. Undefined is rendered as nothing rather than as "all
   * zones" — an old cache cannot answer the question either way.
   */
  scope?: RouteScope;
  /**
   * The district's tariff for this route, or undefined on a cache that predates it.
   * Undefined is not "no charge" — it is the app falling back to its placeholder
   * rate table, which the receipt has to be able to say.
   */
  rates?: RateSchedules;
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

/**
 * Whose round this list is.
 *
 * `zoneScoped: false` is not a failure — it is Admin, or a collector the office has
 * not posted to a zone yet, and the server sends the whole district rather than
 * stranding them (see app-backend/utils/collectorZones.js). But the screen has to
 * say which, because "28 accounts" means something completely different depending
 * on the answer, and a collector should never be left assuming the district's entire
 * customer list is their morning.
 */
export interface RouteScope {
  zoneScoped: boolean;
  zones: string[];
}

interface RouteResponse {
  accounts: RouteAccount[];
  barangays: BarangaySummary[];
  scope?: RouteScope;
  rates?: RateSchedules;
}

interface RouteCache {
  accounts: RouteAccount[];
  barangays: BarangaySummary[];
  scope?: RouteScope;
  /**
   * The district's tariff, cached alongside the route because the receipt is
   * printed in the same place the route is walked — offline. Undefined on a cache
   * written before the server served rates; `calculateBill` falls back to the app's
   * placeholder table in that case and says so. See shared/utils/billing-calculator.
   */
  rates?: RateSchedules;
}

/** Older installs cached a bare array, before barangays existed. */
function parseCache(raw: string): RouteCache {
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return { accounts: parsed.map(normalise), barangays: [] };
  return {
    accounts: (parsed.accounts ?? []).map(normalise),
    barangays: parsed.barangays ?? [],
    scope: parsed.scope,
    rates: parsed.rates,
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
    // Absent from a cache written before the server resolved a reading source. The
    // screens fall back to `lastReadingDate` when both are missing, so an old cache
    // keeps behaving exactly as it did rather than claiming every stop is unread.
    previousReadingPeriod: account.previousReadingPeriod ?? null,
    previousReadingSource: account.previousReadingSource ?? null,
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
    const { accounts, barangays, scope, rates } = await apiFetch<RouteResponse>('/accounts/route');
    const cache: RouteCache = { accounts: accounts.map(normalise), barangays, scope, rates };

    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
      await AsyncStorage.setItem(SYNCED_AT_KEY, Date.now().toString());
      // The rows are current again, whatever this phone did to them before.
      await AsyncStorage.removeItem(REFRESH_KEY);
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

  /** The district's tariff as this phone last had it, for the screens that bill offline. */
  static async getCachedRates(): Promise<RateSchedules | undefined> {
    return (await this.readCache()).rates;
  }

  /**
   * Mark the cached route as needing a re-pull on the next read.
   *
   * ⚠️ THE ROUTE WENT STALE THE MOMENT A READING SYNCED, AND NOTHING SAID SO. The
   * cache is served for six hours (`STALE_MS`), which is right for a list that
   * changes when the office connects a meter — and wrong the instant this phone
   * changes it. A reading that reaches TWD becomes the account's new previous
   * reading, so until the next pull the detail screen measured against a figure its
   * own collector had already replaced: ACC-2026-0007 was read to 150 at 13:23 on
   * 2026-09-04 and the screen was still offering 103 from the 1st as the number to
   * bill against.
   *
   * Clearing the timestamp rather than pulling here is deliberate. Sync runs in the
   * background, possibly on the edge of signal, and the re-pull belongs to whoever
   * next opens the route — where a failure is visible and `pullFailed` can say so.
   */
  static async invalidate(): Promise<void> {
    try {
      await AsyncStorage.setItem(REFRESH_KEY, '1');
    } catch {
      // The cache expires on the ordinary six-hour schedule instead. A missed
      // refresh is not worth failing a completed sync over.
    }
  }

  /**
   * A flag of its own, rather than clearing `SYNCED_AT_KEY`.
   *
   * Deleting the timestamp would force the re-pull just as well and would also
   * erase when the route was last downloaded — and that is the number the Route
   * screen prints so a collector can judge how much to trust the list. A phone that
   * pulled ten minutes ago would claim it had never had a route, which is the one
   * thing on that screen a collector acts on. Staleness and provenance are two
   * facts; they get two keys.
   */
  private static async needsRefresh(): Promise<boolean> {
    try {
      return (await AsyncStorage.getItem(REFRESH_KEY)) !== null;
    } catch {
      return false;
    }
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
    const stale =
      before === null || Date.now() - before > STALE_MS || (await this.needsRefresh());

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
      {
        currentReading: number;
        consumption: number;
        synced: boolean;
        readingDate: string;
        timestamp: number;
      }
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

      /**
       * The LATEST reading wins, by when it was taken — not by where it sits in the
       * array.
       *
       * This was "last one seen", on the reasoning that the outbox is appended to in
       * order. It is, by `saveMeterReading` — and `mergeSyncedMeterReadings` also
       * appends, a whole history at a time, pulled back from the server after a
       * reinstall or onto a second handset. Those arrive in the server's order and
       * land after everything already stored, so an older reading could be the last
       * one seen for an account and win, and the screen would offer a superseded
       * figure as this meter's current reading.
       *
       * Comparing `timestamp` — the phone's clock at the meter, the same key the
       * server resolves a meter-month by — makes the answer independent of how the
       * records got onto this phone. Date breaks a tie first so a record with no
       * usable timestamp still orders by the day it was taken.
       */
      const held = byAccount.get(r.accountNumber);
      const newer =
        !held ||
        r.readingDate > held.readingDate ||
        (r.readingDate === held.readingDate && (r.timestamp ?? 0) >= held.timestamp);
      if (!newer) continue;

      byAccount.set(r.accountNumber, {
        currentReading: r.currentReading,
        consumption: r.consumption,
        synced: r.synced,
        readingDate: r.readingDate,
        timestamp: r.timestamp ?? 0,
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
          rates: ratesFor(cache.rates, account),
        } satisfies RouteAccountRow;
      })
      .sort((a, b) => a.sequence - b.sequence);

    return {
      rows,
      // Falls back to a client-side count for a cache written before the server
      // sent a summary; the two agree, because both count the same list.
      barangays: cache.barangays.length ? cache.barangays : summarise(cache.accounts),
      scope: cache.scope,
      rates: cache.rates,
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
