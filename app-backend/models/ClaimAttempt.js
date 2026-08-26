const mongoose = require('mongoose');

/**
 * One OTP verification attempt against one account number.
 *
 * Two jobs:
 *   - Rate limiting: ≥ MAX_FAILURES rows with success: false for an account
 *     number inside a sliding hour locks claiming/verifying for that account
 *     (see controllers/consumerClaimController.js). Keyed on ACCOUNT NUMBER,
 *     not userId, deliberately: the thing being protected is the household's
 *     account, and one attacker may hold several free Google identities.
 *   - Staff review: when the threshold trips, the triggering rows are marked
 *     flagged: true so support can pull them up without re-deriving the window.
 *
 * Rows are written for EVERY verify outcome — including "no code was ever
 * issued" — so brute-forcing cannot stay invisible by skipping issuance.
 *
 * Known trade-off, accepted deliberately: because counting is keyed on the
 * attacker-supplied account number, anyone can lock a third party's claiming
 * for an hour by failing five times against it. That DoS costs far less than
 * the credential-stuffing it prevents; revisit only if abuse shows up.
 */
const claimAttemptSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'GoogleUser', required: true },
    accountNumber: { type: String, required: true, trim: true },
    attemptedAt: { type: Date, required: true, default: Date.now },
    success: { type: Boolean, required: true },
    /** Set in bulk when this row is part of a window that crossed the limit. */
    flagged: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'claim_attempts' }
);

// The rate-limit query shape: failures for one account inside a time window.
claimAttemptSchema.index({ accountNumber: 1, attemptedAt: -1 });

/** Sliding-window constants, declared beside the schema they parameterise so
 * controller and future staff tooling read one definition. */
const FAILURE_WINDOW_MS = 60 * 60 * 1000;
const MAX_FAILURES_PER_WINDOW = 5;

module.exports = mongoose.model('ClaimAttempt', claimAttemptSchema);
module.exports.FAILURE_WINDOW_MS = FAILURE_WINDOW_MS;
module.exports.MAX_FAILURES_PER_WINDOW = MAX_FAILURES_PER_WINDOW;
