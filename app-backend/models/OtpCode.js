const mongoose = require('mongoose');

const OTP_TTL_MS = 5 * 60 * 1000;

/**
 * A hashed one-time code challenge for proving control of an account's
 * mobile number.
 *
 * The PLAINTEXT CODE IS NEVER PERSISTED OR LOGGED — only its bcrypt hash
 * leaves this module's call sites, and it dies unrecorded the moment sendOtp()
 * resolves. Bcrypt, not sha256: six digits is a 10^6 keyspace, and bcrypt's
 * cost is precisely what makes offline cracking of a stolen hash expensive.
 * (The DB is behind Atlas network controls anyway, but this hash is the kind
 * of thing that ends up in a stray backup.)
 *
 * Issuing a new code SUPERSEDES prior unconsumed ones for the same
 * (userId, accountNumber) by marking them consumed — see the controller. The
 * spec's "latest non-consumed" lookup stays correct either way, but leaving
 * several live codes around would widen the guessing window for no benefit.
 */
const otpCodeSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'GoogleUser', required: true },
    accountNumber: { type: String, required: true, trim: true },
    codeHash: { type: String, required: true },
    /** Issue time + 5 minutes. Expiry is CHECKED before use; the TTL index is
     * housekeeping so spent challenges stop accumulating. */
    expiresAt: { type: Date, required: true },
    consumed: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'otp_codes' }
);

// Mongo's TTL monitor sweeps these out shortly after expiry.
otpCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// Cooldown check (recent issue?) and verification lookup (latest unconsumed?).
otpCodeSchema.index({ userId: 1, accountNumber: 1, consumed: 1, createdAt: -1 });

otpCodeSchema.statics.isLive = function isLive(doc, now = new Date()) {
  return Boolean(doc && !doc.consumed && doc.expiresAt > now);
};

module.exports = mongoose.model('OtpCode', otpCodeSchema);
module.exports.OTP_TTL_MS = OTP_TTL_MS;
