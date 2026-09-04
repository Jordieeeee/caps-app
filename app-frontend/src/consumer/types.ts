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
  /**
   * The meter reading TWD holds that has not become a bill yet, or null.
   *
   * ⚠️ THIS IS THE ONLY FIELD ON THIS SCREEN THAT CHANGES ON THE DAY THE METER IS
   * READ. Everything else here describes the last billing run, so a household whose
   * meter was read this morning saw nothing at all until the run at the end of the
   * period — the app was silent about a visit that had already happened.
   *
   * Null means either that the latest reading is already on a bill above, or that
   * nothing has been read since. The server cannot distinguish them and neither can
   * this screen, so null renders as nothing rather than as "not read yet".
   *
   * It carries NO amount, deliberately. See app-backend/utils/latestReading.js: the
   * rate schedule, arrears and discounts that turn cubic metres into pesos live in
   * the Admin Portal, and a figure shown here that the bill then contradicts is one
   * the consumer will have believed first.
   */
  latestReading: LatestReading | null;
}

/**
 * A reading of a household's own meter, before it becomes a bill.
 *
 * `state` is about TWD's review, not about the household: `pending` is the ordinary
 * state of a reading waiting for the month to close, and must not be rendered as a
 * problem. Neither value means the consumer owes anything yet.
 */
export interface LatestReading {
  /** `YYYY-MM-DD`, the day the collector stood at the meter. */
  readingDate: string;
  /** `YYYY-MM`, the period this reading will be billed in. */
  period: string;
  currentReading: number;
  /**
   * Cubic metres SINCE THE LAST BILL — not since the last reading, and the
   * difference is not a nuance.
   *
   * The server derives this as `currentReading` minus the closing reading of the
   * household's most recent non-void bill, which is the same subtraction the
   * district's next billing run performs. It was previously the handset's own
   * stamped `consumption`, a reading-to-reading delta that on live data understated
   * the unbilled total by more than half. See app-backend/utils/latestReading.js
   * for the three separate ways that figure went wrong.
   *
   * Null where TWD holds no baseline at all (no bill, no opening reading) — print
   * the card without a quantity rather than printing 0, which is a claim that the
   * household has used no water.
   */
  consumption: number | null;
  /**
   * `YYYY-MM` of the bill `consumption` is measured from, or null when it was
   * measured from an opening reading because the household has no bill yet.
   *
   * Present so the card can NAME the bill instead of saying "since then" and
   * leaving the reader to assume it means the reading date directly above it — the
   * one date on the card the figure is definitely not measured from.
   */
  billedThrough: string | null;
  state: 'pending' | 'approved';
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

/**
 * One bill, as GET /billing presents it.
 *
 * `amount` is null when the portal's bill carries no total — the same rule
 * `Account.outstanding` follows, and for the same reason: ₱0.00 is a claim that
 * this bill is for nothing. Render null as "Amount unavailable", never as zero.
 */
export interface Bill {
  id: string;
  /**
   * Which water account this bill is for, resolved server-side from the bill's
   * `connectionId`. Null for legacy bills that predate that field.
   *
   * Only meaningful once a consumer can hold more than one account — which they
   * now can. Show it when the list spans several accounts; a single-house
   * consumer already knows whose bill they are looking at.
   */
  accountNumber: string | null;
  /** `YYYY-MM` as the portal stores it. Run it through `formatBillingPeriod`. */
  billingPeriod: string;
  amount: number | null;
  /** ISO 8601 from the server. */
  dueDate: string;
  status: 'paid' | 'pending' | 'overdue';
  /** Computed server-side against server time — never re-derived from the device clock. */
  daysOverdue: number;
  paymentDate?: string;
  paymentMethod?: string;

  /**
   * Water used in the billing period, in cubic metres, with the two meter readings
   * it was computed from.
   *
   * These come off the bill, not from `meterreadings`: a collector's raw reading can
   * be pending approval, rejected or re-read, and what a consumer is owed sight of
   * is the figure their bill actually charged for.
   *
   * Null means the bill carries no reading (a legacy import, a minimum-charge bill).
   * Show "Not recorded" — 0 m³ says the household used no water in a month it was
   * billed for.
   */
  consumptionCuM: number | null;
  previousReading: number | null;
  currentReading: number | null;
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
 * What a notification is about. Drives the icon and the wording, not the styling.
 *
 * Mirrors the `kind` enum in app-backend/models/Notification.js exactly. Kept as a
 * separate union from `NoticeType` even though both describe "a thing TWD is
 * telling you": a Notice is published to the whole district, a Notification is
 * addressed to one consumer and can carry their money on it.
 */
export type NotificationKind =
  | 'due-reminder'
  | 'payment-confirmation'
  | 'service-alert'
  | 'announcement';

/**
 * One message addressed to this consumer, as GET /notifications presents it.
 *
 * ⚠️ THIS LIST IS EMPTY TODAY AND THAT IS CORRECT. `consumernotifications` has no
 * writer yet — see app-backend/models/Notification.js. The screen must render an
 * empty state that says so, and must never fall back to fixtures to look populated.
 *
 * `amount` and `dueDate` arrive as explicit nulls rather than being omitted, so a
 * `due-reminder` that is missing its figure is visibly missing it rather than
 * silently rendering as ₱0.00 — the same rule `Account.outstanding` follows.
 */
export interface Notification {
  id: string;
  kind: NotificationKind;
  message: string;
  accountNumber: string | null;
  amount: number | null;
  /** `YYYY-MM-DD` as the server stores it, or null. */
  dueDate: string | null;
  read: boolean;
  /** ISO 8601. */
  createdAt: string;
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
  /**
   * Whether this consumer may set an email/password credential from the app.
   *
   * False for a password consumer — they already sign in that way, and their
   * credential belongs to the Admin Portal, so the app has nothing to offer them.
   * True only for a Google identity, which is the case that has no password
   * anywhere in the system.
   */
  canSetPassword: boolean;
  /**
   * Whether one is set already. Separate from `canSetPassword` because "may I
   * offer this?" and "is it done?" are different questions, and one flag would
   * force the screen to guess which it was being told.
   */
  hasPassword: boolean;
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
