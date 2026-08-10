import AsyncStorage from '@react-native-async-storage/async-storage';

import { OfflineStorage } from '@/collector/services/offline-storage';
import { localDateKey } from '@/shared/format/date';
import { apiFetch } from '@/shared/services/api-client';
import type { NoticeKind } from '@/shared/utils/billing-calculator';

/**
 * Reconnection and disconnection work, on the phone.
 *
 * The two flows are one module because they are one job done twice with the sign
 * flipped: the collector arrives at an address holding an order from the office,
 * confirms what they did, and hands over a slip. Splitting them into two parallel
 * implementations is how the wording, the sync mapping and the idempotency rule
 * drift apart between them.
 *
 * ⚠️ This used to be five hard-coded orders — "Carlos Garcia, WD-12345" and friends
 * — behind a TODO waiting on an endpoint that already existed. GET /service-orders
 * has been there the whole time; nothing called it. The fixtures are deleted rather
 * than kept as a fallback, for the same reason the route's twelve fake households
 * were: confirming a fixture wrote a real completion to TWD for an account the
 * district does not have, and `serviceorders` still holds the one that got through.
 * An empty list is a fact a collector can phone the office about. A plausible fake
 * one sends them to a stranger's gate to shut off the water.
 */

/** The office's orders, as last received. Separate from the outbox below. */
const STORAGE_KEY = '@collector_service_orders_cache';
const SYNCED_AT_KEY = '@collector_service_orders_synced_at';

/**
 * How long a cached order list is served without asking again.
 *
 * Shorter than the route's six hours. A route changes when a meter is installed —
 * days apart — but a disconnection order is raised by the office *during* the day
 * it is meant to be served, so an hour-old list is already worth re-checking when
 * there is signal to do it with. Pull-to-refresh overrides it, and so does a cold
 * cache.
 */
const STALE_MS = 60 * 60 * 1000;

/**
 * What the collector still has to do with this order.
 *
 * `pending-sync` is deliberately not called "done": the work happened and TWD does
 * not know yet. That is a different fact from `done`, and on a disconnection it is
 * the difference between "the office can tell the consumer why their water is off"
 * and "the office cannot".
 */
export type ServiceOrderState = 'pending' | 'pending-sync' | 'done';

export interface ServiceOrderRow {
  /** The office's order reference. Also the sync key — see `confirm`. */
  id: string;
  kind: NoticeKind;
  accountNumber: string;
  consumerName: string;
  address: string;
  reason: string;
  /**
   * What the consumer owed when the order was raised, and what they paid to clear
   * it. Optional because nothing issues them yet: `bills` and `billings` are empty
   * in the district's database, so there is no figure to carry. The screens render
   * these rows only when a value is present rather than printing ₱0.00, which on a
   * disconnection notice would be a claim that the consumer owes nothing.
   */
  outstandingBalance?: number;
  settledAmount?: number;
  settledDate?: string;
  state: ServiceOrderState;
  confirmedAt?: number;
  note?: string;
}

/**
 * An order list as a screen renders it, plus how much to trust it.
 *
 * Same contract as the route snapshot, for the same reason: these are cached for
 * offline use, so a collector can be looking at Tuesday's orders on Friday and
 * nothing on the screen would otherwise say so.
 */
export interface ServiceOrderSnapshot {
  rows: ServiceOrderRow[];
  /** Epoch ms of the last successful pull. Null means this phone has never had one. */
  syncedAt: number | null;
  /** True when the rows came off the cache because the network was not used or failed. */
  fromCache: boolean;
  /** True when TWD was actually asked and could not be reached. */
  pullFailed: boolean;
}

/** What GET /service-orders returns, after the controller's registry join. */
interface ServiceOrderDto {
  clientId: string;
  type: NoticeKind;
  accountNumber: string;
  consumerName?: string;
  address?: string;
  accountAddress?: string;
  reason?: string;
  status?: 'pending' | 'completed' | 'cancelled';
  outstandingBalance?: number;
  settledAmount?: number;
  settledDate?: string;
}

interface OrderResponse {
  orders: ServiceOrderDto[];
}

/**
 * Fill in what an order document is allowed not to carry.
 *
 * Never a fallback to the account number for a name: the card puts that on its own
 * line already, and a stop that renders the same string twice reads as a bug in the
 * one moment it needs to read as a person.
 */
function normalise(order: ServiceOrderDto): Omit<ServiceOrderRow, 'state'> {
  return {
    id: order.clientId,
    kind: order.type,
    accountNumber: order.accountNumber ?? '',
    consumerName: order.consumerName?.trim() || 'Name not on file',
    address: order.address?.trim() || order.accountAddress?.trim() || '',
    reason: order.reason?.trim() || 'No reason recorded',
    outstandingBalance: order.outstandingBalance,
    settledAmount: order.settledAmount,
    settledDate: order.settledDate,
  };
}

export class ServiceOrderService {
  /**
   * Pull the office's orders and cache them. Throws if it cannot.
   *
   * Throwing is the point: the caller decides what an unreachable server means, and
   * in the field it means "work from what is on the phone" — a decision that has to
   * know the pull failed.
   */
  static async pull(): Promise<ServiceOrderDto[]> {
    const { orders } = await apiFetch<OrderResponse>('/service-orders');

    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
      await AsyncStorage.setItem(SYNCED_AT_KEY, Date.now().toString());
    } catch {
      // Cache write failed; the list this call returns is still good for the
      // session. Losing the cache costs the next cold start, not this one.
    }

    return orders;
  }

  private static async readCache(): Promise<ServiceOrderDto[]> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Corrupt cache reads as no cache.
    }
    return [];
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
   * Orders of one kind, with what the collector has already done to them merged in.
   *
   * Same join as the route list: "is this confirmed?" is a question about the
   * office's order plus this phone's outbox, and a screen that answers it inline
   * gets it wrong the moment something is confirmed but not yet synced.
   */
  static async list(
    kind: NoticeKind,
    { force = false }: { force?: boolean } = {}
  ): Promise<ServiceOrderSnapshot> {
    const before = await this.syncedAt();
    const stale = before === null || Date.now() - before > STALE_MS;

    let pulled: ServiceOrderDto[] | null = null;
    let pullFailed = false;
    if (force || stale) {
      try {
        pulled = await this.pull();
      } catch {
        pullFailed = true;
        // Offline, or TWD unreachable. The cached orders are the correct thing to
        // work from — the expected case in the field, not an error.
      }
    }

    const fromCache = pulled === null;
    const orders = pulled ?? (await this.readCache());
    const saved = await OfflineStorage.getServiceOrders();
    const byId = new Map(saved.map((o) => [o.id, o]));

    const rows = orders
      .filter((order) => order.type === kind)
      .map((order): ServiceOrderRow => {
        const base = normalise(order);
        const done = byId.get(base.id);

        // This phone's own record wins while it is still unsent: it is the only
        // place the confirmation exists, and the office's copy cannot know about it
        // yet. Once TWD has it, the two agree anyway.
        if (done && done.status === 'completed') {
          return {
            ...base,
            state: done.synced ? 'done' : 'pending-sync',
            confirmedAt: done.timestamp,
            note: done.fieldVerification,
          };
        }

        // Completed at the office — by another collector, or by this one on a
        // handset that has since been wiped. Still done; there is nothing to
        // confirm a second time.
        if (order.status === 'completed') return { ...base, state: 'done' };

        return { ...base, state: 'pending' };
      });

    return {
      rows,
      syncedAt: fromCache ? before : await this.syncedAt(),
      fromCache,
      pullFailed,
    };
  }

  static async get(kind: NoticeKind, id: string): Promise<ServiceOrderRow | null> {
    const { rows } = await this.list(kind);
    return rows.find((r) => r.id === id) ?? null;
  }

  /**
   * How much of each kind is still waiting, from the cache alone.
   *
   * No network: this runs on the Route screen, which must render the same numbers
   * in a barangay with no signal as it does at the depot. A count that quietly
   * needed signal would read as "nothing to do" exactly where the collector is
   * least able to check.
   */
  static async pendingCounts(): Promise<Record<NoticeKind, number> | null> {
    // Null, not zero, when this phone has never pulled the list. "None waiting" is
    // a claim about the office's workload; a handset that has never asked is not
    // entitled to make it, and the caller renders neutral text instead.
    if ((await this.syncedAt()) === null) return null;

    const [orders, saved] = await Promise.all([
      this.readCache(),
      OfflineStorage.getServiceOrders(),
    ]);
    const completedLocally = new Set(
      saved.filter((o) => o.status === 'completed').map((o) => o.id)
    );

    const counts: Record<NoticeKind, number> = { reconnection: 0, disconnection: 0 };
    for (const order of orders) {
      if (order.status === 'completed') continue;
      if (completedLocally.has(order.clientId)) continue;
      if (order.type in counts) counts[order.type] += 1;
    }
    return counts;
  }

  /**
   * Record that the work happened.
   *
   * The office's order reference is the sync key, not a fresh clientId. That is
   * deliberate and it is the opposite of the rule for readings: those are new facts
   * that must never collide, so they get a generated id. A service order is a
   * *pre-existing* record being completed — confirming REC-001 twice, because the
   * collector tapped through a laggy screen, has to produce one completed REC-001
   * and not two. Upserting on the order reference is what makes the retry
   * idempotent.
   */
  static async confirm(order: ServiceOrderRow, note: string | undefined): Promise<number> {
    const confirmedAt = Date.now();

    await OfflineStorage.saveServiceOrder({
      id: order.id,
      type: order.kind,
      accountNumber: order.accountNumber,
      accountAddress: order.address,
      reason: order.reason,
      status: 'completed',
      fieldVerification: note?.trim() ? note.trim() : undefined,
      // Local: the day the collector stood at the meter, not the UTC day. A
      // disconnection carried out at 7am was being filed as the day before — see
      // localDateKey.
      completionDate: localDateKey(new Date(confirmedAt)),
      timestamp: confirmedAt,
      synced: false,
    });

    return confirmedAt;
  }
}
