const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

/**
 * A password for a Google-verified consumer. Owned by THIS backend.
 *
 * The gap it fills: a consumer who signs in with Google and claims their account
 * by OTP has no password anywhere in the system, so the email/password half of the
 * sign-in screen can never work for them. If their phone loses the Google account —
 * a reset handset, a shared phone, a school-managed account — they are locked out
 * of a utility app that holds their bills.
 *
 * ⚠️ THE POINT IS THAT THIS IS NOT A SECOND IDENTITY. It is a second *credential*
 * on the identity they already have, keyed by `googleUserId`. Signing in with it
 * mints the same session the Google callback mints — same `sub`, same lowercase
 * role — so `requireConsumerScope` resolves the same ConsumerLinks and the person
 * sees exactly the same accounts whichever way they signed in.
 *
 * The alternative, and the reason this model exists at all: creating a `consumers`
 * document with a passwordHash (what `POST /auth/register` does) would give them a
 * registry record that no `serviceconnections` row points at. They would set a
 * password, sign in with it weeks later, and find an app with no accounts and no
 * bills — the same person, the same meter, an empty screen. See
 * controllers/accountController.js `listMine`, which reads ownership from the
 * connections, not from the login.
 *
 * ## Why not `appcredentials`
 *
 * That is the Admin Portal's login store and this backend is deliberately
 * read-only against it (see models/AppCredential.js — the portal owns its indexes,
 * its lockout counters, its temp-password expiry and `credentialVersion`). Writing
 * a mobile-set password there would put two applications behind one collection's
 * invariants without the portal team having agreed to it. This collection is ours:
 * we create it, we index it, nothing else reads it.
 *
 * A portal credential always WINS over this one — authController tries
 * `appcredentials` first. So if the office later issues a real portal login for the
 * same email, that login takes over and this row becomes dormant rather than
 * fighting it.
 */
const mobileCredentialSchema = new mongoose.Schema(
  {
    /**
     * The identity this password belongs to — `google_users._id`.
     *
     * Unique: one password per identity. It is also the reason a password here can
     * never be orphaned from its accounts, because the same id is what
     * ConsumerLink keys on.
     */
    googleUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GoogleUser',
      required: true,
      unique: true,
    },
    /**
     * The email typed at the sign-in screen. A copy of the Google identity's
     * address, stored here because login looks credentials up by what was typed,
     * before it knows whose they are.
     *
     * Kept in step by `setFor` below rather than by a join: a Google address can
     * change (googleAuthController updates the row when it does), and a stale
     * email here would mean the password silently stops working at the sign-in
     * screen while the Google button still works.
     */
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true },
  },
  { collection: 'mobilecredentials', timestamps: true }
);

mobileCredentialSchema.methods.comparePassword = function comparePassword(plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

mobileCredentialSchema.statics.findByEmail = function findByEmail(email) {
  return this.findOne({ email: String(email).toLowerCase().trim() });
};

mobileCredentialSchema.statics.findByGoogleUser = function findByGoogleUser(googleUserId) {
  return this.findOne({ googleUserId });
};

/**
 * Set or replace the password for one identity.
 *
 * An upsert rather than create-or-update at the call site: setting a password and
 * changing it are the same operation to everyone except the person doing it, and
 * two code paths here would eventually differ in how they hash.
 */
mobileCredentialSchema.statics.setFor = async function setFor({ googleUserId, email, password }) {
  const passwordHash = await bcrypt.hash(password, 10);
  return this.findOneAndUpdate(
    { googleUserId },
    { $set: { email: String(email).toLowerCase().trim(), passwordHash } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

mobileCredentialSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.passwordHash;
    return ret;
  },
});

module.exports = mongoose.model('MobileCredential', mobileCredentialSchema);
