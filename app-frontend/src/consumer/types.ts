import type { NoticePriority, NoticeType } from '@/shared/components/status-badge';

/**
 * The shapes the consumer API actually returns.
 *
 * These lived in `data/mock-data.ts` alongside the fixtures, which is why the
 * fixtures outlived their usefulness — deleting the mock would have deleted the
 * types. They are separate now so the mock file could go.
 */

export interface Account {
  id: string;
  accountNumber: string;
  address: string;
  type: 'residential' | 'commercial' | 'government';
  status: 'active' | 'inactive';
  linkedDate?: string;
  /**
   * null when the balance is not attributable to this account on its own — a
   * meter shared by several consumers. Render it as "See total balance", never as
   * ₱0.00: zero is a claim that the household owes nothing.
   * See app-backend/utils/accountPaymentSummary.js.
   */
  outstanding: number | null;
  paymentStatus: 'Active' | 'Past Due' | 'Unknown';
}

export interface Bill {
  id: string;
  billingPeriod: string;
  amount: number;
  /** ISO 8601 from the server. */
  dueDate: string;
  status: 'paid' | 'pending' | 'overdue';
  /** Computed server-side against server time — never re-derived from the device clock. */
  daysOverdue: number;
  paymentDate?: string;
  paymentMethod?: string;
}

export interface Notice {
  id: string;
  title: string;
  type: NoticeType;
  /** ISO 8601 publish time. */
  date: string;
  content: string;
  priority: NoticePriority;
}

/**
 * Matches MAX_LINKED_ACCOUNTS in app-backend/controllers/accountController.js.
 * The server is the enforcing side; this only drives the "n of 5 linked" copy.
 */
export const MAX_ACCOUNTS = 5;
