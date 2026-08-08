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
 * Matches MAX_LINKED_ACCOUNTS in app-backend/controllers/accountController.js.
 * The server is the enforcing side; this only drives the "n of 5 linked" copy.
 */
export const MAX_ACCOUNTS = 5;
