const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { displayName } = require('../utils/consumerIdentity');

/**
 * The mailing address as the Admin Portal stores it.
 *
 * `_id: false` because it is one embedded value, not a collection member, and
 * `default: undefined` so mongoose never materialises an empty address object on
 * a self-registered consumer that has none — writing `{}` into the portal's
 * registry would turn "no address on file" into "an address, blank".
 */
const mailingAddressSchema = new mongoose.Schema(
  {
    houseStreet: { type: String, trim: true, maxlength: 120 },
    barangay: { type: String, trim: true, maxlength: 120 },
    city: { type: String, trim: true, maxlength: 120 },
    province: { type: String, trim: true, maxlength: 120 },
    zip: { type: String, trim: true, maxlength: 10 },
  },
  { _id: false }
);

/** One contact channel. Portal shape: { contactType, value, isPrimary }. */
const contactSchema = new mongoose.Schema(
  {
    contactType: { type: String, trim: true },
    value: { type: String, trim: true, maxlength: 40 },
    isPrimary: { type: Boolean },
  },
  { _id: false }
);

/**
 * Consumer accounts live in their own collection, separate from staff
 * (`User`: Collector/Admin). `role` is kept as a fixed field — rather than
 * inferring it purely from "which model answered" — so the role-generic
 * helpers in authController.js (`issueSession`, `signAccessToken`,
 * `REFRESH_TTL_MS[user.role]`) work unchanged against either model.
 */
const consumerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    /**
     * NOT `immutable: true` — that flag suppresses Mongoose's default-value
     * fill-in on hydrate (only applies it at document creation), so any
     * document missing this field would come back from `findById` with
     * `role: undefined` forever, breaking every role-keyed lookup downstream
     * (`REFRESH_TTL_MS[user.role]`, `MODEL_BY_ROLE[...]`, the JWT `role` claim).
     * That is exactly the shape of the portal's own consumer records: the
     * portal writes its own consumer-registry documents into this same
     * `consumers` collection (see AppCredential.js) with no `role` field at
     * all, so this must stay a plain default.
     */
    role: { type: String, enum: ['Consumer'], default: 'Consumer' },
    /**
     * Auth-level account state. `disabled` blocks token issuance outright.
     *
     * Delinquency is deliberately NOT modelled here: an unpaid bill is a billing
     * restriction, not an authentication failure — a delinquent consumer must
     * still be able to log in to see what they owe and pay it.
     */
    status: { type: String, enum: ['active', 'disabled'], default: 'active', required: true },
    accountNumbers: [{ type: String }], // linked account numbers, cap enforced in accountController
    // Consumer-specific fields
    address: { type: String, required: true },
    type: { type: String, enum: ['residential', 'commercial', 'government'], required: true },
    outstanding: { type: Number, default: 0, min: 0 },
    paymentStatus: { type: String, enum: ['Active', 'Delinquent', 'Past Due'], default: 'Active' },

    /**
     * The only two things a consumer may change about themselves — and the ONLY
     * two portal-registry paths declared on this schema, deliberately.
     *
     * The portal writes a much richer record here (`consumerNo`, `firstName` /
     * `middleName` / `lastName`, `birthDate`, `validId`, `isSeniorCitizen`,
     * `consumerType`, …). Those are all readable — mongoose keeps unknown fields
     * in the hydrated document and `toObject()` returns them — but under
     * `strict: true` a path that is not on the schema **cannot be written**:
     * `doc.set('validId.idNumber', x)` is a silent no-op and never reaches Mongo.
     *
     * Leaving them undeclared is therefore a structural guarantee, not a
     * convention. Even a future careless `Object.assign(consumer, req.body)` — the
     * exact bug that let feedback arrive pre-`resolved` — physically cannot alter
     * a consumer's legal name, their government ID, or their senior-citizen flag
     * through this backend. Those matter because:
     *
     *   • `isSeniorCitizen` drives a statutory utility discount (RA 9994). Letting
     *     a consumer self-declare it is letting them grant themselves a price cut.
     *   • `validId` is the district's identity trail. If the holder can rewrite it,
     *     it stops evidencing anything.
     *   • `firstName`/`lastName`/`birthDate` are the identity the valid ID was
     *     checked against, and changing a name on a utility account is a counter
     *     transaction with documents behind it.
     *
     * All of those stay office-only, on purpose. Add a path here only after
     * deciding it is safe for the account holder to change unsupervised.
     */
    contacts: { type: [contactSchema], default: undefined },
    mailingAddress: { type: mailingAddressSchema, default: undefined },
  },
  { timestamps: true }
);

consumerSchema.methods.comparePassword = function comparePassword(plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

consumerSchema.statics.createWithPassword = async function createWithPassword({
  password,
  ...rest
}) {
  const passwordHash = await bcrypt.hash(password, 10);
  return this.create({ ...rest, passwordHash });
};

consumerSchema.statics.findByEmail = function findByEmail(email) {
  return this.findOne({ email: String(email).toLowerCase().trim() });
};

// Never serialise the password hash back to a client.
//
// Portal-created consumers carry no `name` (the portal's own registry stores
// firstName/middleName/lastName, or businessName/contactPersonName for a
// business account, on this same document) — compose a display name from
// whichever of those is present rather than sending `name: undefined` to a
// screen that renders it directly (e.g. app-frontend/src/app/consumer/index.tsx).
consumerSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    if (!ret.name) ret.name = displayName(ret);
    return ret;
  },
});

module.exports = mongoose.model('Consumer', consumerSchema);
