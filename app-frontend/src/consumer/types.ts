import type {
  FeedbackStatus,
  NoticePriority,
  NoticeType,
} from '@/shared/components/status-badge';

/**
 * The shapes the consumer API actually returns.
 *
 * These lived in `data/mock-data.ts` alongside the fixtures, which is why the
 * fixtures outlived their usefulness — deleting the mock would have deleted the
 * types. They are separate now so the mock file could go.
 */

/**
 * One water account, as GET /accounts presents it.
 *
 * Sourced from the district's `serviceconnections` registry, not from this app —
 * a row exists because TWD connected a meter to this consumer, so there is no
 * client-side notion of "linking" one. `id` is the connection's id for that reason.
 */
export interface Account {
  id: string;
  accountNumber: string;
  /** Where the *meter* is (the service address), not where the bill is posted. */
  address: string;
  type: 'residential' | 'commercial' | 'government';
  status: 'active' | 'inactive';
  /** ISO 8601 date the district connected the meter, when it recorded one. */
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

/**
 * Where a request to add an account has got to.
 *
 * `approved` does not mean the account is linked — it means staff agreed to link
 * it, in the Admin Portal, which is the only place the connection can be made. The
 * account then appears in `listAccounts()` on its own. Treat this as the status of
 * a conversation, not of a permission.
 */
export type LinkRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

/**
 * One request the consumer has filed with TWD.
 *
 * There is deliberately no `reason` field for a rejection. The server has none to
 * send: a staff note like "that account belongs to someone else" would confirm both
 * that the account exists and that it is held, which is precisely what the request
 * flow is built not to disclose. A rejected consumer is pointed at the office.
 * See `presentRequest` in app-backend/controllers/accountController.js.
 */
export interface AccountLinkRequest {
  id: string;
  accountNumber: string;
  note: string | null;
  status: LinkRequestStatus;
  /** ISO 8601. */
  submittedAt: string;
  /** ISO 8601, or null while nobody has decided. */
  decidedAt: string | null;
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

export interface MailingAddress {
  houseStreet: string | null;
  barangay: string | null;
  city: string | null;
  province: string | null;
  zip: string | null;
}

/**
 * The consumer's record in the Admin Portal's registry, as GET /profile presents it.
 *
 * Everything here is displayed; only `contactNumber` and `mailingAddress` can be
 * sent back. The rest is office-only — see the comment on the `contacts` /
 * `mailingAddress` fields in app-backend/models/Consumer.js for why the identity
 * and senior-citizen fields specifically must not be self-editable.
 *
 * Nearly every field is nullable because the portal's own records are uneven: a
 * business consumer has `businessName` and no `firstName`, a self-registered
 * consumer has neither, and plenty of rows carry no address at all. Null here means
 * "the district holds nothing for this", which the UI states rather than hides.
 */
export interface ConsumerProfile {
  consumerNo: string | null;
  consumerType: 'individual' | 'business' | null;
  name: string | null;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  businessName: string | null;
  contactPersonName: string | null;
  /** ISO 8601. */
  birthDate: string | null;
  validId: { idType: string | null; idNumber: string | null } | null;
  isSeniorCitizen: boolean;
  email: string | null;
  contactNumber: string | null;
  mailingAddress: MailingAddress | null;
  accountNumbers: string[];
  /** ISO 8601. */
  memberSince: string | null;
}

/** Exactly what PATCH /profile accepts. Anything else the server ignores. */
export interface ConsumerProfileEdit {
  contactNumber?: string;
  mailingAddress?: {
    houseStreet: string;
    barangay: string;
    city: string;
    province: string;
    zip: string;
  };
}

/** The four values POST /feedback accepts for `type`. */
export type FeedbackType = 'billing' | 'service-quality' | 'system-issue' | 'other';

export interface Feedback {
  id: string;
  type: FeedbackType;
  subject: string;
  message: string;
  status: FeedbackStatus;
  /** ISO 8601. */
  submittedAt: string;
  /**
   * ISO 8601, or null while the record is untouched since submission.
   *
   * Null is not "unknown" — it is the positive fact that nothing has moved. See
   * `present()` in app-backend/controllers/feedbackController.js: mongoose stamps
   * `updatedAt` equal to `createdAt` on insert, so the server collapses that case
   * to null rather than letting the app report a status change that never happened.
   */
  statusChangedAt: string | null;
}

/**
 * Deliberately absent: `MAX_ACCOUNTS`.
 *
 * It was 5, and its comment said it matched `MAX_LINKED_ACCOUNTS` in
 * app-backend/controllers/accountController.js — a constant that no longer exists
 * there. It drove a "1 of 5" counter and a warning at the cap.
 *
 * There is nothing left for it to count. A consumer's accounts are however many
 * meters the district has connected to them; the app neither creates nor limits
 * that, so printing a ceiling the app does not enforce (against a backend that does
 * not either) was inventing a rule. If the office-approval flow lands with a real
 * cap, it belongs on the server first and is re-added here to match.
 */
