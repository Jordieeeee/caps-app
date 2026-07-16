import {
  mockAccounts,
  mockBills,
  mockNotices,
  type Account,
  type Bill,
  type Notice,
} from '@/consumer/data/mock-data';
import { apiFetch } from '@/shared/services/api-client';

/**
 * The consumer module's read layer.
 *
 * Every function here is async and every screen treats it as fallible, so the
 * loading and error paths are real code rather than components nobody renders.
 * The bodies currently resolve mock data — see mock-data.ts for why — but the
 * signatures are already the shapes the API returns, so each swap is one line:
 *
 *   listAccounts  → apiFetch<{ accounts: Account[] }>('/accounts')
 *   listBills     → apiFetch<{ bills: Bill[] }>(`/billing/${accountNumber}`)
 *   listNotices   → apiFetch<{ announcements: Notice[] }>('/announcements')
 *   linkAccount   → apiFetch('/accounts/link', { method: 'POST', body: … })
 *   unlinkAccount → apiFetch(`/accounts/${accountNumber}`, { method: 'DELETE' })
 *
 * `apiFetch` (shared/services/api-client) already attaches the bearer token and
 * refreshes it, and all five routes above exist and are Consumer-role-gated.
 *
 * ⚠️ Honest limitation while the bodies are mock: the error path cannot fire,
 * because nothing here rejects. The screens are wired for it; the state is
 * unreachable until these bodies do real I/O.
 *
 * Deliberately NOT here: a `payBill`. There is no payment route in the backend —
 * `Billing.paymentDate`/`paymentMethod` are written by an Admin creating the bill
 * or by a collector syncing field cash, and nothing accepts a consumer-initiated
 * payment. Adding a stub here would be the first step toward a UI that claims the
 * water district takes payments through this app. See app/consumer/bills/how-to-pay.
 */

export async function listAccounts(): Promise<Account[]> {
  return mockAccounts;
}

export async function listBills(): Promise<Bill[]> {
  return mockBills;
}

export async function listNotices(): Promise<Notice[]> {
  return mockNotices;
}

export async function unlinkAccount(accountNumber: string): Promise<void> {
  // Real: DELETE /accounts/:accountNumber → { account }
  void accountNumber;
}

export type FeedbackType = 'billing' | 'service-quality' | 'system-issue' | 'other';

/**
 * The one call here that is real, because it is the one that can be.
 *
 * POST /feedback exists, is Consumer-gated, and requires exactly these three
 * fields. It is also user-initiated rather than a page load, so a failure surfaces
 * as "couldn't send, try again" against an action the consumer just took — which
 * is the correct thing for it to do, and makes the error path genuinely reachable
 * rather than decorative.
 *
 * ⚠️ The old form also collected an "Account Number (Optional)" and dropped it:
 * the Feedback schema stores consumerId/type/subject/message/status and has no
 * account field, so anything typed there went nowhere. The field is gone. If TWD
 * wants feedback attributable to one meter, the schema needs `accountNumber` first.
 */
export async function submitFeedback(input: {
  type: FeedbackType;
  subject: string;
  message: string;
}): Promise<void> {
  await apiFetch('/feedback', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export type { Account, Bill, Notice };
