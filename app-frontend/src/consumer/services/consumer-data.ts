import { apiFetch } from '@/shared/services/api-client';
import type {
  Account,
  Bill,
  ConsumerProfile,
  ConsumerProfileEdit,
  Feedback,
  FeedbackType,
  Notice,
} from '@/consumer/types';

/**
 * The consumer module's read layer — real I/O against the TWD backend.
 *
 * These bodies used to resolve fixtures from `data/mock-data.ts`. The endpoints
 * existed the whole time; they were pointed at collections nothing writes
 * (`billings`, `announcements`) while the Admin Portal published into `bills` and
 * `cmscontents`. Repointing the models is what made these calls return data, so
 * the mock is deleted rather than kept as a fallback — a silent fallback to
 * fixtures is how a consumer ends up reading someone else's plausible balance
 * during an outage.
 *
 * Every call is scoped server-side to the caller's token. There is deliberately no
 * accountNumber parameter anywhere here: the previous `GET /billing/:accountNumber`
 * let any logged-in consumer read any household's billing history.
 */

export async function listAccounts(): Promise<Account[]> {
  const { accounts } = await apiFetch<{ accounts: Account[] }>('/accounts');
  return accounts;
}

export async function listBills(): Promise<Bill[]> {
  const { bills } = await apiFetch<{ bills: Bill[] }>('/billing');
  return bills;
}

export async function listNotices(): Promise<Notice[]> {
  const { announcements } = await apiFetch<{ announcements: Notice[] }>('/announcements');
  return announcements;
}

export async function unlinkAccount(accountNumber: string): Promise<void> {
  await apiFetch(`/accounts/${encodeURIComponent(accountNumber)}`, { method: 'DELETE' });
}

/**
 * Deliberately absent: `linkAccount`.
 *
 * The server now refuses self-service linking (403) because the old endpoint
 * attached any account number the caller sent, with no ownership check — a full
 * customer-base enumeration over sequential account numbers. Linking happens at the
 * TWD office until the district picks a verification workflow. A client function
 * here would only produce a button that always fails.
 * See app-backend/controllers/accountController.js.
 */

/**
 * POST /feedback — Consumer-gated, requires exactly these three fields.
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

/**
 * GET /feedback — everything this consumer has sent, newest first.
 *
 * Ordering is the server's (`Feedback.listByConsumer` sorts on createdAt), not
 * re-derived here: the list is short and already correct, and a client-side sort
 * would be a second opinion about time that can disagree with the first.
 */
export async function listMyFeedback(): Promise<Feedback[]> {
  const { feedback } = await apiFetch<{ feedback: Feedback[] }>('/feedback');
  return feedback;
}

/** GET /profile — the caller's own registry record. Token-scoped, no parameter. */
export async function getProfile(): Promise<ConsumerProfile> {
  const { profile } = await apiFetch<{ profile: ConsumerProfile }>('/profile');
  return profile;
}

/**
 * PATCH /profile — the two self-service fields.
 *
 * Returns the profile the server ended up with rather than assuming the request
 * body became the truth: the server normalises a phone number (`0917 123 4567` is
 * stored as `09171234567`) and trims every address part, so echoing back what was
 * typed would leave the screen showing something the district did not save.
 */
export async function updateProfile(edit: ConsumerProfileEdit): Promise<ConsumerProfile> {
  const { profile } = await apiFetch<{ profile: ConsumerProfile }>('/profile', {
    method: 'PATCH',
    body: JSON.stringify(edit),
  });
  return profile;
}

export type {
  Account,
  Bill,
  ConsumerProfile,
  ConsumerProfileEdit,
  Feedback,
  FeedbackType,
  MailingAddress,
  Notice,
} from '@/consumer/types';
