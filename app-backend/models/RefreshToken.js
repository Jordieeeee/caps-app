const crypto = require('crypto');
const mongoose = require('mongoose');

/**
 * A single issued refresh token.
 *
 * Refresh tokens are opaque random strings, not JWTs: a JWT refresh token cannot
 * be revoked before it expires without a server-side lookup anyway, so the JWT
 * buys nothing and costs us the ability to cut off a lost field device.
 *
 * Only the SHA-256 hash is stored. A leaked database dump therefore does not
 * yield usable tokens. SHA-256 (not bcrypt) is deliberate: the token is 256 bits
 * of CSPRNG output, so it has no guessable structure for a brute-forcer to
 * exploit, and refresh runs on the hot path of every reconnect.
 */
const refreshTokenSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true, unique: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    /** Set when this token is rotated, so a replay of the old token is detectable. */
    replacedByHash: { type: String, default: null },
  },
  { timestamps: true }
);

// Purge naturally-expired tokens. The document survives exactly as long as the
// token could have been replayed, which is the window reuse detection cares about.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

refreshTokenSchema.statics.hash = function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
};

/** Generate a new opaque token and persist its hash. Returns the raw token — the only time it exists in plaintext. */
refreshTokenSchema.statics.issue = async function issue(userId, ttlMs) {
  const raw = crypto.randomBytes(32).toString('hex');
  await this.create({
    tokenHash: this.hash(raw),
    user: userId,
    expiresAt: new Date(Date.now() + ttlMs),
  });
  return raw;
};

/** Revoke every live token for a user — used on logout-all and on reuse detection. */
refreshTokenSchema.statics.revokeAllForUser = function revokeAllForUser(userId) {
  return this.updateMany(
    { user: userId, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
};

refreshTokenSchema.methods.isLive = function isLive() {
  return this.revokedAt === null && this.expiresAt.getTime() > Date.now();
};

module.exports = mongoose.model('RefreshToken', refreshTokenSchema);
