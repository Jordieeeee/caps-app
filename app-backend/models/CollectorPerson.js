const mongoose = require('mongoose');

/**
 * A staff member in the Admin Portal's registry — READ-ONLY from this backend.
 *
 * The portal keeps its people here and their jobs in `employments`; this backend
 * previously knew only `collectors`, which is this repo's own seed collection.
 * The two are unrelated sets of documents that happen to describe the same role,
 * and the consequence was that NO real TWD collector could use the mobile app —
 * only the six invented ones the seed script wrote.
 *
 * `email` is the field that identifies a person to Google sign-in, and it is
 * sparsely populated: five of six rows have none. That is why resolution falls
 * back rather than assuming, and why a missing email means "not matchable"
 * rather than "no such collector".
 *
 * Partial schema, `autoIndex: false`: the portal owns the shape and the indexes,
 * and mounting this model must never write to its collection.
 */
const collectorPersonSchema = new mongoose.Schema(
  {
    firstName: String,
    middleName: String,
    lastName: String,
    suffix: String,
    email: { type: String, lowercase: true, trim: true },
    /** `[{ contactType: 'mobile', value: '09…', isPrimary: true }]` */
    contacts: [{ contactType: String, value: String, isPrimary: Boolean }],
  },
  { collection: 'collectorpersons', autoIndex: false, strict: true }
);

/** The portal stores name parts; the app shows one line. */
collectorPersonSchema.statics.displayName = function displayName(person) {
  if (!person) return null;
  const full = [person.firstName, person.middleName, person.lastName, person.suffix]
    .map((part) => (part || '').trim())
    .filter(Boolean)
    .join(' ');
  return full || null;
};

collectorPersonSchema.statics.primaryMobile = function primaryMobile(person) {
  const contacts = Array.isArray(person && person.contacts) ? person.contacts : [];
  const mobiles = contacts.filter((c) => c && c.contactType === 'mobile' && c.value);
  const chosen = mobiles.find((c) => c.isPrimary) || mobiles[0];
  return chosen ? chosen.value : null;
};

module.exports = mongoose.model('CollectorPerson', collectorPersonSchema);
