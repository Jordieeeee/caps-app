const mongoose = require('mongoose');

/**
 * Google-auth identity, one document per Google account that has ever signed in.
 *
 * This is deliberately NOT the Admin-portal `User` model: that one owns the
 * `users` collection with passwordHash documents and an 'Admin'-only role enum.
 * Sharing the collection would mean two schemas, two index sets and two query
 * surfaces over the same documents. This model gets its own collection instead,
 * with exactly the fields the Google flow needs — nothing about passwords,
 * because there are none here.
 */
const googleUserSchema = new mongoose.Schema(
  {
    /** Google's stable account identifier (the id_token `sub` claim). Never changes, even if the email does. */
    googleUid: { type: String, required: true, unique: true },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      // Unique, not just indexed: the collector allowlist is keyed by email, so
      // two identities sharing one address would make allowlist decisions
      // ambiguous. A recycled Gmail address re-registered by a different Google
      // account will surface as a duplicate-key error rather than silently
      // inheriting the previous holder's standing.
      unique: true,
    },
    role: { type: String, enum: ['unclaimed', 'consumer', 'collector'], default: 'unclaimed' },
  },
  // createdAt/updatedAt cover the `created_at` column from the spec; updatedAt
  // is free bookkeeping for the claim/verify flow to build on.
  { timestamps: true, collection: 'google_users' }
);

googleUserSchema.statics.findByGoogleUid = function findByGoogleUid(googleUid) {
  return this.findOne({ googleUid });
};

module.exports = mongoose.model('GoogleUser', googleUserSchema);
