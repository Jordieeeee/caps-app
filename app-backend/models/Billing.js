const mongoose = require('mongoose');

/**
 * The Admin Portal's bill store — READ-ONLY from this backend.
 *
 * This model has now been wrong about the same collection twice, in two different
 * ways, and both failures looked identical from the app: an empty Bills screen.
 *
 *   1. It defaulted to the `billings` collection, which nothing has ever written.
 *   2. It pointed at `bills` but kept mobile-shaped field names, so
 *      `find({ consumer: id })` matched nothing — the portal's billing run writes
 *      `consumerId`, `period` and a `charges` sub-document, not `consumer`,
 *      `billingPeriod` and `amount`.
 *
 * Verified against the live `bills` documents (checked 2026-08-13):
 *
 *   billNo            "BILLTEST202607"
 *   consumerId        ObjectId → consumers      NOT `consumer`
 *   connectionId      ObjectId → serviceconnections   (see note below)
 *   period            "2026-07"                 NOT `billingPeriod`
 *   dueDate           Date
 *   status            UNPAID | PAID | OVERDUE   UPPERCASE
 *   readingId         ObjectId → meterreadings
 *   previousReading / currentReading / consumptionCuM
 *   charges           { basicCharge, seniorDiscount, arrears, totalAmountDue }
 *   isVoid, voidInfo, billingRunId, consumerSnapshot
 *
 * ⚠️ `connectionId` IS NEW AND IT MATTERS. utils/accountPaymentSummary.js says at
 * length that real bills carry no account reference, which is why a consumer with
 * two meters gets `outstanding: null`. That is no longer true of freshly generated
 * bills. It is left alone here deliberately — attributing a balance per meter is a
 * change to what the district says a household owes, and it should land on its own,
 * against bills from a real billing run rather than the three test bills that exist
 * today. This comment is the note to whoever picks that up.
 *
 * Money and readings are read through the helpers below, never off the document.
 * The portal stores charges as Decimal128 and the reading figures as plain numbers,
 * and a Decimal128 arrives in JS as an object whose `+` is string concatenation:
 * `sum + b.charges.totalAmountDue` produces "01800.002300.00", not 4100. Declaring
 * them `Mixed` and converting on read tolerates either representation instead of
 * throwing a CastError the day the portal changes one.
 *
 * Writes stay with the portal: it owns arrears carry-forward, voiding and the
 * penalty run. `strict` keeps unknown keys out and nothing here calls create().
 */

const chargesSchema = new mongoose.Schema(
  {
    basicCharge: mongoose.Schema.Types.Mixed,
    seniorDiscount: mongoose.Schema.Types.Mixed,
    arrears: mongoose.Schema.Types.Mixed,
    totalAmountDue: mongoose.Schema.Types.Mixed,
  },
  { _id: false }
);

const billingSchema = new mongoose.Schema(
  {
    billNo: { type: String },
    consumerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Consumer',
      required: true,
      index: true,
    },
    connectionId: { type: mongoose.Schema.Types.ObjectId },
    billingRunId: { type: mongoose.Schema.Types.ObjectId },
    readingId: { type: mongoose.Schema.Types.ObjectId },
    period: { type: String, required: true },
    dueDate: { type: Date, required: true },
    status: { type: String },
    charges: { type: chargesSchema, default: undefined },

    /** The meter figures the bill was computed from. See `consumptionOf`. */
    previousReading: mongoose.Schema.Types.Mixed,
    currentReading: mongoose.Schema.Types.Mixed,
    consumptionCuM: mongoose.Schema.Types.Mixed,

    /**
     * Not written by the portal's billing run today — a bill flips to PAID with no
     * record of when or how, on the document at least. Declared so the day a
     * payment run starts stamping them the app shows them, and presented as null
     * until then rather than as an empty row.
     */
    paymentDate: { type: Date },
    paymentMethod: { type: String },

    isVoid: { type: Boolean, default: false },
    carriedForwardInto: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { collection: 'bills', timestamps: true, autoIndex: false, strict: true }
);

/**
 * Decimal128 | number | numeric string | null → number | null.
 *
 * Null rather than 0 for anything unparseable, and every caller has to decide what
 * to do about it. Zero is a claim — "this household used no water", "this bill is
 * for nothing" — and it is the wrong one to make out of a missing field.
 */
function toNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = Number(typeof value === 'string' ? value : value.toString());
  return Number.isFinite(parsed) ? parsed : null;
}

/** What the consumer owes on this bill, in pesos. Null when the bill carries no total. */
function amountOf(bill) {
  return toNumber(bill.charges ? bill.charges.totalAmountDue : null);
}

/**
 * The portal's status in this app's vocabulary: `paid` | `unpaid`.
 *
 * Case-folded because the portal writes `UNPAID`/`PAID`/`OVERDUE` and this model's
 * previous incarnation assumed lowercase — `'PAID' !== 'paid'` counted every settled
 * bill as outstanding, which inflates the balance a consumer reads.
 *
 * `OVERDUE` deliberately collapses into `unpaid`. Whether an unpaid bill is late is
 * a question about today's date, and the portal's answer is as old as its last
 * billing run; billingController re-derives it against server time on every read.
 */
function isPaid(bill) {
  return String(bill.status || '').toLowerCase() === 'paid';
}

/** Cubic metres billed, and the two readings behind them. All nullable. */
function consumptionOf(bill) {
  return {
    consumptionCuM: toNumber(bill.consumptionCuM),
    previousReading: toNumber(bill.previousReading),
    currentReading: toNumber(bill.currentReading),
  };
}

/**
 * Every live bill for one consumer, newest period first.
 *
 * Sorted on `period` rather than `dueDate` because period is what the consumer sees
 * and what the usage history is grouped by; `dueDate` breaks ties for two bills
 * issued in the same month (a re-issue after a void).
 *
 * Voided bills are excluded: a bill the office cancelled is not something the
 * consumer owes, and showing it would inflate the balance they see against what the
 * counter would tell them.
 */
billingSchema.statics.listForConsumer = function listForConsumer(consumerId) {
  return this.find({ consumerId, isVoid: { $ne: true } }).sort({ period: -1, dueDate: -1 });
};

const Billing = mongoose.model('Billing', billingSchema);

module.exports = Billing;
module.exports.amountOf = amountOf;
module.exports.isPaid = isPaid;
module.exports.consumptionOf = consumptionOf;
module.exports.toNumber = toNumber;
