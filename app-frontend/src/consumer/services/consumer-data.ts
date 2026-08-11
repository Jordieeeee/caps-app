import { apiFetch } from '@/shared/services/api-client';
import type {
  Account,
  AccountLinkRequest,
  Bill,
  ConsumerProfile,
  ConsumerProfileEdit,
  Feedback,
  FeedbackType,
  Notice,
  Notification,
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

/**
 * GET /notifications — messages addressed to this consumer, newest first.
 *
 * ⚠️ EXPECT `[]`. Nothing writes `consumernotifications` yet, so this endpoint is
 * correct and empty at the same time. That is not a reason to point it somewhere
 * fuller: it was previously reading the Admin Portal's staff feed — batch-billing
 * logs addressed to `recipientRole: 'admin'` — and returned `[]` only because the
 * `consumerId` filter happened to match none of them. See
 * app-backend/models/Notification.js.
 *
 * The distinction from `listNotices()` is the audience and it is not cosmetic:
 * notices are published to the district, these are addressed to one household and
 * can carry an amount and a due date. They are rendered in one screen and must not
 * be merged into one list.
 */
export async function listNotifications(): Promise<Notification[]> {
  const { notifications } = await apiFetch<{ notifications: Notification[] }>('/notifications');
  return notifications;
}

/**
 * PATCH /notifications/:id/read — mark one as read.
 *
 * Returns the server's version of the row rather than assuming the request body
 * became the truth, for the same reason `updateProfile` does: the screen should
 * show what TWD stored, not what we asked it to store.
 */
export async function markNotificationRead(id: string): Promise<Notification> {
  const { notification } = await apiFetch<{ notification: Notification }>(
    `/notifications/${encodeURIComponent(id)}/read`,
    { method: 'PATCH' }
  );
  return notification;
}

/**
 * POST /accounts/link-requests — ask TWD to add an account to this profile.
 *
 * ⚠️ THIS DOES NOT LINK ANYTHING, and the screen calling it must not imply that it
 * does. It files a request; TWD staff verify the person and make the link in the
 * Admin Portal, after which the account arrives through `listAccounts()` on its own.
 *
 * The server never reports whether the account number exists — a real account, a
 * stranger's account and a typo all return the same 201. That is deliberate (account
 * numbers are sequential and printed on every bill), so there is nothing to surface
 * here beyond "TWD has your request", and inventing a "found it" state would be a
 * claim the response cannot support.
 *
 * Returns 200 rather than 201 when an identical request is already pending, with
 * that request — which callers can treat the same way.
 */
export async function requestAccountLink(input: {
  accountNumber: string;
  note?: string;
}): Promise<AccountLinkRequest> {
  const { request } = await apiFetch<{ request: AccountLinkRequest }>('/accounts/link-requests', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return request;
}

/** GET /accounts/link-requests — this consumer's own requests, newest first. */
export async function listLinkRequests(): Promise<AccountLinkRequest[]> {
  const { requests } = await apiFetch<{ requests: AccountLinkRequest[] }>('/accounts/link-requests');
  return requests;
}

/** DELETE /accounts/link-requests/:id — withdraw one that is still pending. */
export async function cancelLinkRequest(id: string): Promise<void> {
  await apiFetch(`/accounts/link-requests/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/**
 * Deliberately absent: `linkAccount` AND `unlinkAccount`. Neither is a client
 * problem — the server refuses both with 403, and would be wrong not to.
 *
 * `linkAccount`: the old endpoint attached any account number the caller sent, with
 * no ownership check — a full customer-base enumeration over sequential account
 * numbers printed on every bill. `requestAccountLink` above is what replaced it:
 * the same intent, routed through a human who can check ID, and answering nothing
 * about accounts the caller does not already hold.
 *
 * `unlinkAccount`: this file used to DELETE `/accounts/:accountNumber`, which
 * `$pull`ed the caller out of `Account.consumerIds` — a field nothing reads. Now
 * that the accounts list is sourced from the district's `serviceconnections`
 * registry, that write changes nothing: the account reappears on the next refresh,
 * after the app has said it was removed. The registry is read-only from the mobile
 * backend by design, so detaching a consumer from a meter is a counter transaction,
 * not a button. The screen offers "This isn't my account" instead, which files
 * feedback for the office to act on.
 *
 * See app-backend/controllers/accountController.js for both.
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
  AccountLinkRequest,
  Bill,
  ConsumerProfile,
  ConsumerProfileEdit,
  Feedback,
  FeedbackType,
  LinkRequestStatus,
  MailingAddress,
  Notice,
  Notification,
  NotificationKind,
} from '@/consumer/types';
