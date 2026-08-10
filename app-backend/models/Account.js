const mongoose = require('mongoose');

const accountSchema = new mongoose.Schema(
  {
    accountNumber: { type: String, required: true, unique: true },
    address: { type: String, required: true },
    type: { type: String, enum: ['residential', 'commercial', 'government'], required: true },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    // outstanding/paymentStatus are NOT stored here — they're derived from the
    // portal's bills on read (see utils/accountPaymentSummary.js), so there is
    // exactly one source of truth and no risk of a stale balance surviving a payment.
    /**
     * ⚠️ DEAD DATA. Do not query this, and do not write to it.
     *
     * It looks like the link between a meter and the household on it, and in the
     * district's live database every one of these references is dangling: ten
     * accounts point at ten consumer ids and none of those documents exist. They are
     * leftovers from this repo's own seed script, which creates a Consumer per
     * account. The portal registers its consumers separately and links them in
     * `serviceconnections`, keyed on `accountNo`.
     *
     * `findByConsumer`, `linkConsumer` and `unlinkConsumer` used to live on this
     * model and are gone rather than left unused — a helper that reads plausible and
     * returns nothing is how this field cost the consumer app its entire accounts
     * list. Resolve ownership through models/ServiceConnection.js.
     *
     * Kept declared, not deleted, so the stale documents stay visible to anyone
     * inspecting the collection instead of being silently stripped on a write.
     */
    consumerIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Consumer' }],
    /** Seed-script bookkeeping. The real date is `ServiceConnection.dateConnected`. */
    linkedDate: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Account', accountSchema);
