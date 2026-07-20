const mongoose = require('mongoose');

/**
 * The Admin Portal's bill store — READ-ONLY from this backend.
 *
 * This model used to declare its own shape and default to the `billings`
 * collection. Nothing has ever written to `billings`: the portal issues every bill
 * into `bills`, with different field names. So mobile queried an empty collection,
 * got `[]`, and the consumer screens fell back to mock data — which is why they
 * were mocked in the first place. The endpoint was fine; it was pointed at nothing.
 *
 * Real shape, from the live documents:
 *   consumer (ObjectId → consumers)   NOT accountNumber
 *   billingPeriod  "2026-07"          ISO month, not "June 2025"
 *   dueDate        Date               NOT a string
 *   status         unpaid|overdue|paid
 *   isVoid, carriedForwardInto        portal-side billing lifecycle
 *
 * Writes stay with the portal: it owns arrears carry-forward, voiding, and the
 * penalty run. A mobile-shaped insert here would be a malformed bill in the
 * district's real billing ledger, so `strict` keeps unknown keys out and nothing
 * in this codebase calls create().
 */
const billingSchema = new mongoose.Schema(
  {
    consumer: { type: mongoose.Schema.Types.ObjectId, ref: 'Consumer', required: true, index: true },
    billingPeriod: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    dueDate: { type: Date, required: true },
    status: { type: String, enum: ['unpaid', 'overdue', 'paid'], default: 'unpaid' },
    paymentDate: { type: Date },
    paymentMethod: { type: String },
    isVoid: { type: Boolean, default: false },
    carriedForwardInto: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { collection: 'bills', timestamps: true, autoIndex: false, strict: true }
);

/**
 * Every live bill for one consumer, newest first.
 *
 * Voided bills are excluded: a bill the office cancelled is not something the
 * consumer owes, and showing it would inflate the balance they see against what
 * the counter would tell them.
 */
billingSchema.statics.listForConsumer = function listForConsumer(consumerId) {
  return this.find({ consumer: consumerId, isVoid: { $ne: true } }).sort({ dueDate: -1 });
};

module.exports = mongoose.model('Billing', billingSchema);
