const mongoose = require('mongoose');

/**
 * Authorization grant: "this Google identity may see billing data for this
 * account number."
 *
 * This document IS the authorization source for consumer billing access — the
 * sole path every consumer-facing billing endpoint must consult server-side.
 * An accountNumber arriving from a client proves nothing by itself; only the
 * existence of an ACTIVE row here (userId + accountNumber, removedAt: null)
 * does.
 *
 * Soft-delete, not hard-delete: an admin unlink (dispute resolution) sets
 * removedAt / removedBy / removalReason and the row stays forever, which is
 * the audit trail for "who had access to whose bills, until when, and why it
 * was taken away". Re-claiming creates a NEW row; history is never rewritten.
 *
 * ONE active link per accountNumber is enforced with a PARTIAL unique index
 * (uniqueness applies only where removedAt is null), so unlinking frees the
 * account number for a legitimate re-claim while two simultaneous active
 * holders remain structurally impossible. MongoDB's partialFilterExpression
 * has no $exists:false form, hence the explicit `default: null` — every
 * active row carries removedAt: null on disk and matches the filter exactly.
 */
const consumerLinkSchema = new mongoose.Schema(
  {
    /** The Google-flow user (models/GoogleUser.js, collection google_users). */
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'GoogleUser', required: true },
    /** Matches Account.accountNumber / ServiceConnection.accountNo verbatim. */
    accountNumber: { type: String, required: true, trim: true },
    /** How the link was proven. Only OTP exists today; enum keeps future
     * channels (in-person with valid ID) explicit. */
    verifiedVia: { type: String, enum: ['otp'], required: true },
    /** The spec's name for "when this became active" (kept alongside the
     * automatic createdAt because unlink audits read better off a named field). */
    linkedAt: { type: Date, required: true, default: Date.now },

    // --- soft-delete / dispute audit ---
    removedAt: { type: Date, default: null },
    /** Admin (portal User) who performed the unlink. */
    removedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    /** Free-text reason captured at unlink time — required by that route. */
    removalReason: { type: String, default: null },
  },
  { timestamps: true, collection: 'consumer_links' }
);

// THE security-critical index: at most one ACTIVE holder per account number.
consumerLinkSchema.index(
  { accountNumber: 1 },
  { unique: true, partialFilterExpression: { removedAt: null } }
);
// Reads: "all accounts this user may see" and "is this user linked to X".
consumerLinkSchema.index({ userId: 1, removedAt: 1 });

consumerLinkSchema.statics.findActiveByUser = function findActiveByUser(userId) {
  return this.find({ userId, removedAt: null }).lean();
};

consumerLinkSchema.statics.findActive = function findActive(query) {
  return this.findOne({ ...query, removedAt: null });
};

module.exports = mongoose.model('ConsumerLink', consumerLinkSchema);
