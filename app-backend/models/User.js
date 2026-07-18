const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['Collector', 'Consumer', 'Admin'], required: true },
    /**
     * Auth-level account state. `disabled` covers a deactivated staff account or
     * a locked consumer login, and blocks token issuance outright.
     *
     * Consumer delinquency is deliberately NOT modelled here: an unpaid bill is a
     * billing restriction, not an authentication failure — a delinquent consumer
     * must still be able to log in to see what they owe and pay it.
     */
    status: { type: String, enum: ['active', 'disabled'], default: 'active', required: true },
    routeIds: [{ type: String }], // collectors: assigned routes
    accountNumbers: [{ type: String }], // consumers: linked account numbers

    /**
     * Human-readable label for the collector's assigned area, e.g. "Zone 1 - Poblacion".
     *
     * Display only. `routeIds` remains the identifier the app keys on — it is what
     * stamps `routeId` onto each meter reading — and this must never be used in its
     * place: it is not unique, not enumerated, and a collector with two routes has
     * only one zone string to describe both.
     */
    zone: { type: String, trim: true },

    /**
     * Staff HR fields. Collectors and Admins only — a Consumer has none of them.
     *
     * `sparse` on employeeId is load-bearing, not decoration. A unique index treats
     * a missing field as null, and null collides with null: without sparse, the
     * *second* Consumer to enrol would be rejected by a duplicate-key error on a
     * field their account is never supposed to have. The index then only covers
     * documents where employeeId actually exists, which is the constraint we
     * actually want — staff IDs unique among staff.
     */
    employeeId: { type: String, unique: true, sparse: true, trim: true },
    phone: { type: String, trim: true },
    /** `YYYY-MM-DD`. A date, not a Date: it is a calendar fact with no time or
     *  timezone, and storing it as a Date invites a UTC shift to move someone's
     *  hire date a day earlier for everyone west of Manila. */
    dateHired: { type: String, trim: true },
  },
  { timestamps: true }
);

userSchema.methods.comparePassword = function comparePassword(plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.statics.createWithPassword = async function createWithPassword({ password, ...rest }) {
  const passwordHash = await bcrypt.hash(password, 10);
  return this.create({ ...rest, passwordHash });
};

userSchema.statics.findByEmail = function findByEmail(email) {
  return this.findOne({ email: String(email).toLowerCase().trim() });
};

// Never serialise the password hash back to a client.
userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);
