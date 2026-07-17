import { OfflineStorage } from '@/collector/services/offline-storage';
import type { NoticeKind } from '@/shared/utils/billing-calculator';

/**
 * Reconnection and disconnection work, on the phone.
 *
 * The two flows are one module because they are one job done twice with the sign
 * flipped: the collector arrives at an address holding an order from the office,
 * confirms what they did, and hands over a slip. Splitting them into two parallel
 * implementations is how the wording, the sync mapping and the idempotency rule
 * drift apart between them.
 */

export interface ServiceOrderRow {
  /** The office's order reference. Also the sync key — see `confirm`. */
  id: string;
  kind: NoticeKind;
  accountNumber: string;
  consumerName: string;
  address: string;
  reason: string;
  /** What the consumer owed when the order was raised. */
  outstandingBalance: number;
  /** Reconnections only: what they paid to clear it. */
  settledAmount?: number;
  settledDate?: string;
  state: 'pending' | 'pending-sync' | 'done';
  confirmedAt?: number;
  note?: string;
}

/**
 * Mock orders.
 *
 * TODO: Replace with GET /api/service-orders?assigned=me. The backend's
 * ServiceOrder model exists and the /service-orders/sync endpoint already accepts
 * completions, but there is no endpoint that hands a collector their outstanding
 * orders, so there is nothing to pre-load from yet.
 */
const MOCK_ORDERS: Omit<ServiceOrderRow, 'state' | 'confirmedAt' | 'note'>[] = [
  {
    id: 'REC-001',
    kind: 'reconnection',
    accountNumber: 'WD-12345',
    consumerName: 'Carlos Garcia',
    address: '24 Mabini Street, Brgy. Poblacion 3, Tanauan City',
    reason: 'Full payment of outstanding balance',
    outstandingBalance: 150.0,
    settledAmount: 150.0,
    settledDate: '2025-07-14',
  },
  {
    id: 'REC-002',
    kind: 'reconnection',
    accountNumber: 'WD-12353',
    consumerName: 'Teresita Mercado',
    address: '77 Gonzales Street, Brgy. Gonzales, Tanauan City',
    reason: 'Payment arrangement completed',
    outstandingBalance: 842.5,
    settledAmount: 842.5,
    settledDate: '2025-07-16',
  },
  {
    id: 'REC-003',
    kind: 'reconnection',
    accountNumber: 'WD-12356',
    consumerName: 'Benigno Katigbak',
    address: '18 Ulango Street, Brgy. Ulango, Tanauan City',
    reason: 'Full payment including penalties',
    outstandingBalance: 1240.0,
    settledAmount: 1240.0,
    settledDate: '2025-07-16',
  },
  {
    id: 'DIS-001',
    kind: 'disconnection',
    accountNumber: 'WD-12350',
    consumerName: 'Lorna Villanueva',
    address: '3 Santol Road, Brgy. Santol, Tanauan City',
    reason: 'Three billing periods unpaid',
    outstandingBalance: 3184.75,
  },
  {
    id: 'DIS-002',
    kind: 'disconnection',
    accountNumber: 'WD-12354',
    consumerName: 'Eduardo Panganiban',
    address: '5 Ambulong Road, Brgy. Ambulong, Tanauan City',
    reason: 'Two billing periods unpaid, no arrangement',
    outstandingBalance: 2067.0,
  },
];

export class ServiceOrderService {
  /**
   * Orders of one kind, with what the collector has already done to them merged in.
   *
   * Same join as the route list: "is this confirmed?" is a question about the
   * office's order plus this phone's outbox, and answering it inline in a screen
   * gets it wrong the moment something is confirmed but not yet synced.
   */
  static async list(kind: NoticeKind): Promise<ServiceOrderRow[]> {
    const saved = await OfflineStorage.getServiceOrders();
    const byId = new Map(saved.map((o) => [o.id, o]));

    return MOCK_ORDERS.filter((o) => o.kind === kind).map((order) => {
      const done = byId.get(order.id);
      if (!done || done.status !== 'completed') {
        return { ...order, state: 'pending' as const };
      }
      return {
        ...order,
        state: done.synced ? ('done' as const) : ('pending-sync' as const),
        confirmedAt: done.timestamp,
        note: done.fieldVerification,
      };
    });
  }

  static async get(kind: NoticeKind, id: string): Promise<ServiceOrderRow | null> {
    const rows = await this.list(kind);
    return rows.find((r) => r.id === id) ?? null;
  }

  /**
   * Record that the work happened.
   *
   * The office's order reference is the sync key, not a fresh clientId. That is
   * deliberate and it is the opposite of the rule for readings and collections:
   * those are new facts that must never collide, so they get a generated id. A
   * service order is a *pre-existing* record being completed — confirming REC-001
   * twice, because the collector tapped through a laggy screen, has to produce one
   * completed REC-001 and not two. Upserting on the order reference is what makes
   * the retry idempotent.
   */
  static async confirm(
    order: ServiceOrderRow,
    note: string | undefined
  ): Promise<number> {
    const confirmedAt = Date.now();

    await OfflineStorage.saveServiceOrder({
      id: order.id,
      type: order.kind,
      accountNumber: order.accountNumber,
      accountAddress: order.address,
      reason: order.reason,
      status: 'completed',
      fieldVerification: note?.trim() ? note.trim() : undefined,
      completionDate: new Date(confirmedAt).toISOString().split('T')[0],
      timestamp: confirmedAt,
      synced: false,
    });

    return confirmedAt;
  }
}
