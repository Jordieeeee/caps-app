import AsyncStorage from '@react-native-async-storage/async-storage';

import { OfflineStorage } from '@/collector/services/offline-storage';
import type { RouteAccount } from '@/shared/utils/billing-calculator';

/**
 * The collector's assigned route, on the phone.
 *
 * The whole flow depends on this being local: the collector walks into a barangay
 * with no signal and has to open an account, see last month's reading, and bill
 * against it. Anything fetched at the point of use is a flow that stops working
 * where it is needed most, so the route is pulled once while there is signal and
 * read from cache thereafter.
 */

const STORAGE_KEY = '@collector_route_accounts';
const PRELOADED_AT_KEY = '@collector_route_preloaded_at';

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

/**
 * Mock route.
 *
 * TODO: Replace with GET /api/accounts/route once the endpoint exists. The
 * backend's Account model currently carries accountNumber, address, type and
 * status — it has no route assignment, no walk sequence, no meter number, and no
 * last-confirmed reading, so there is nothing to fetch yet. Those five fields are
 * what this screen needs; the shape below is the request being made of the API.
 *
 * Sequence is walk order, not account order: the route is a physical path through
 * a barangay, and a collector who has to re-sort it in their head at every gate is
 * being handed the office's data model instead of their own job.
 */
const MOCK_ROUTE: RouteAccount[] = [
  {
    id: 'acct-1',
    sequence: 1,
    accountNumber: 'WD-12345',
    consumerName: 'Carlos Garcia',
    address: '24 Mabini Street, Brgy. Poblacion 3, Tanauan City',
    meterNumber: 'MTR-884213',
    previousReading: 1250,
    rateClass: 'Residential',
  },
  {
    id: 'acct-2',
    sequence: 2,
    accountNumber: 'WD-12346',
    consumerName: 'Ana Martinez',
    address: '117 J.P. Laurel Highway, Brgy. Darasa, Tanauan City',
    meterNumber: 'MTR-884219',
    previousReading: 980,
    rateClass: 'Residential',
  },
  {
    id: 'acct-3',
    sequence: 3,
    accountNumber: 'WD-12347',
    consumerName: 'Roberto Rodriguez',
    address: '8 Rizal Avenue, Brgy. Sambat, Tanauan City',
    meterNumber: 'MTR-884227',
    previousReading: 1450,
    rateClass: 'Residential',
  },
  {
    id: 'acct-4',
    sequence: 4,
    accountNumber: 'WD-12348',
    consumerName: 'Maria Clara Bautista',
    address: '52 Del Pilar Street, Brgy. Poblacion 4, Tanauan City',
    meterNumber: 'MTR-884231',
    previousReading: 1102,
    rateClass: 'Residential',
  },
  {
    id: 'acct-5',
    sequence: 5,
    accountNumber: 'WD-12349',
    consumerName: 'Jose Miguel Aquino',
    address: '9 Bonifacio Extension, Brgy. Trapiche, Tanauan City',
    meterNumber: 'MTR-884240',
    previousReading: 1338,
    rateClass: 'Residential',
  },
  {
    id: 'acct-6',
    sequence: 6,
    accountNumber: 'WD-12350',
    consumerName: 'Lorna Villanueva',
    address: '3 Santol Road, Brgy. Santol, Tanauan City',
    meterNumber: 'MTR-884256',
    previousReading: 915,
    rateClass: 'Residential',
  },
  {
    id: 'acct-7',
    sequence: 7,
    accountNumber: 'WD-12351',
    consumerName: 'Aling Nena Sari-Sari Store',
    address: '61 J.P. Laurel Highway, Brgy. Darasa, Tanauan City',
    meterNumber: 'MTR-884262',
    previousReading: 1487,
    rateClass: 'Commercial',
  },
  {
    id: 'acct-8',
    sequence: 8,
    accountNumber: 'WD-12352',
    consumerName: 'Ricardo Dimaculangan',
    address: '14 Malvar Street, Brgy. Poblacion 1, Tanauan City',
    meterNumber: 'MTR-884270',
    previousReading: 1024,
    rateClass: 'Residential',
  },
  {
    id: 'acct-9',
    sequence: 9,
    accountNumber: 'WD-12353',
    consumerName: 'Teresita Mercado',
    address: '77 Gonzales Street, Brgy. Gonzales, Tanauan City',
    meterNumber: 'MTR-884288',
    previousReading: 1195,
    rateClass: 'Residential',
  },
  {
    id: 'acct-10',
    sequence: 10,
    accountNumber: 'WD-12354',
    consumerName: 'Eduardo Panganiban',
    address: '5 Ambulong Road, Brgy. Ambulong, Tanauan City',
    meterNumber: 'MTR-884293',
    previousReading: 1408,
    rateClass: 'Residential',
  },
  {
    id: 'acct-11',
    sequence: 11,
    accountNumber: 'WD-12355',
    consumerName: 'Corazon Alcantara',
    address: '30 Natatas Street, Brgy. Natatas, Tanauan City',
    meterNumber: 'MTR-884301',
    previousReading: 963,
    rateClass: 'Residential',
  },
  {
    id: 'acct-12',
    sequence: 12,
    accountNumber: 'WD-12356',
    consumerName: 'Benigno Katigbak',
    address: '18 Ulango Street, Brgy. Ulango, Tanauan City',
    meterNumber: 'MTR-884315',
    previousReading: 1276,
    rateClass: 'Residential',
  },
];

export class RouteAccountService {
  /**
   * Pull the route while there is still signal, and cache it.
   *
   * Never throws on a network failure — a collector opening the app in the field
   * has no connection by definition, and the cached route from the depot is the
   * correct thing to work from. Only a cold cache with no network is a real error,
   * and the caller distinguishes that by getting an empty list back.
   */
  static async preload(): Promise<RouteAccount[]> {
    // TODO: const accounts = await apiFetch('/accounts/route') once it exists.
    const accounts = MOCK_ROUTE;

    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
      await AsyncStorage.setItem(PRELOADED_AT_KEY, Date.now().toString());
    } catch {
      // Cache write failed; the in-memory list this call returns is still good for
      // the session. Losing the cache costs the next cold start, not this one.
    }

    return accounts;
  }

  static async getCached(): Promise<RouteAccount[]> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw) as RouteAccount[];
    } catch {
      // Corrupt cache reads as no cache.
    }
    return this.preload();
  }

  static async preloadedAt(): Promise<number> {
    try {
      const raw = await AsyncStorage.getItem(PRELOADED_AT_KEY);
      return raw ? Number.parseInt(raw, 10) : 0;
    } catch {
      return 0;
    }
  }

  /**
   * The route as the list screen needs it: every account, in walk order, each
   * carrying what the collector has already done to it today.
   *
   * The join happens here rather than in the screen because "has this been read?"
   * is a question about two stores — the route cache and the reading outbox — and
   * a screen that answers it inline gets it subtly wrong the moment a reading is
   * saved but not yet synced.
   */
  static async list(): Promise<RouteAccountRow[]> {
    const [accounts, readings] = await Promise.all([
      this.getCached(),
      OfflineStorage.getMeterReadings(),
    ]);

    const today = new Date().toISOString().split('T')[0];
    const byAccount = new Map<string, { currentReading: number; consumption: number; synced: boolean }>();

    for (const r of readings) {
      if (r.readingDate !== today) continue;
      // Last write wins: a re-read of the same meter today is a correction.
      byAccount.set(r.accountNumber, {
        currentReading: r.currentReading,
        consumption: r.consumption,
        synced: r.synced,
      });
    }

    return accounts
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
  }

  static async get(id: string): Promise<RouteAccountRow | null> {
    const rows = await this.list();
    return rows.find((r) => r.id === id) ?? null;
  }
}
