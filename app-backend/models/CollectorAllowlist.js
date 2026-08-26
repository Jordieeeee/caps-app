const mongoose = require('mongoose');

/**
 * Emails permitted to hold the 'collector' role on sign-in.
 *
 * Membership grants privilege on its own — an email present here gets a
 * collector session at /auth/google/callback whether or not their users record
 * has been promoted — so writes belong to the admin allowlist routes only,
 * never the auth path. Read-only from the auth flow's perspective, by design.
 *
 * Offboarding is a SOFT delete (removedAt set by an admin; rows are never
 * hard-deleted) so the audit question "who granted this person collector
 * access, when was it revoked, and who did it" stays answerable forever.
 * isAllowed() filters removedAt: null, which is what makes removal effective
 * on the very next sign-in.
 */
const collectorAllowlistSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    /** Portal admin (models/User.js) who added this entry. */
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // --- offboarding audit ---
    /** Null while active. Presence excludes the entry from every auth check. */
    removedAt: { type: Date, default: null },
    /** Admin (portal User) who removed the entry. */
    removedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, collection: 'collector_allowlist' }
);

collectorAllowlistSchema.statics.isAllowed = async function isAllowed(email) {
  const doc = await this.findOne({
    email: String(email).toLowerCase().trim(),
    removedAt: null,
  }).lean();
  return Boolean(doc);
};

module.exports = mongoose.model('CollectorAllowlist', collectorAllowlistSchema);
