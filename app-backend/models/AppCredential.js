const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

/**
 * The TWD Admin Portal's login store — READ-ONLY from this backend.
 *
 * The mobile API and the Admin Portal share one Atlas database (`twd-admin`), but
 * they were built with two separate auth systems. The portal is the system of
 * record for *creating* staff and consumer logins, and it puts every credential it
 * issues here, in `appcredentials`: an email + bcrypt hash, a lowercase `role`, and
 * a `profileId`/`profileModel` pointer at the actual person's record in
 * `collectors` / `consumers` / `users`.
 *
 * The mobile backend originally only knew how to authenticate against the profile
 * collections' own `passwordHash` field, so any account created in the portal was
 * invisible to mobile login (the portal's email never even matches the profile's).
 * This model is the bridge: `authController` looks here first.
 *
 * We only ever READ this collection — the portal owns its shape, its indexes, and
 * its write path (lockout counters, temp-password expiry, credentialVersion). So
 * the schema is deliberately partial (just the fields auth needs) and
 * `autoIndex` is off, so mounting this model never mutates the portal's collection.
 */
const appCredentialSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    /** Lowercase in the portal: 'collector' | 'consumer' | 'admin'. */
    role: { type: String, required: true },
    /** The person this login belongs to, in the collection named by `profileModel`. */
    profileId: { type: mongoose.Schema.Types.ObjectId, required: true },
    profileModel: { type: String },
    status: { type: String },
    mustChangePassword: { type: Boolean },
    tempPasswordExpiresAt: { type: Date },
    lockedUntil: { type: Date },
    failedAttempts: { type: Number },
    credentialVersion: { type: Number },
  },
  { collection: 'appcredentials', autoIndex: false, strict: true }
);

appCredentialSchema.methods.comparePassword = function comparePassword(plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

/** True while a portal-applied lockout is still in effect. */
appCredentialSchema.methods.isLocked = function isLocked() {
  return !!this.lockedUntil && this.lockedUntil.getTime() > Date.now();
};

appCredentialSchema.statics.findByEmail = function findByEmail(email) {
  return this.findOne({ email: String(email).toLowerCase().trim() });
};

/** The credential governing a given profile (the `sub` of a mobile session), if any. */
appCredentialSchema.statics.findByProfile = function findByProfile(profileId) {
  return this.findOne({ profileId });
};

module.exports = mongoose.model('AppCredential', appCredentialSchema);
