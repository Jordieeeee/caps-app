const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

/**
 * Collector accounts live in their own collection, separate from `User`
 * (now Admin-only). `role` is kept as a fixed field — rather than inferring
 * it purely from "which model answered" — so the role-generic helpers in
 * authController.js (`issueSession`, `signAccessToken`,
 * `REFRESH_TTL_MS[user.role]`) work unchanged against any of the models.
 */
const collectorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['Collector'], default: 'Collector', immutable: true },
    /** Auth-level account state. `disabled` blocks token issuance outright. */
    status: { type: String, enum: ['active', 'disabled'], default: 'active', required: true },
    routeIds: [{ type: String }], // assigned routes

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
     * Every collector has one — unlike the old shared `User` collection, this is no
     * longer sparse: a collector-only collection means employeeId is always
     * present, matching the live `employeeId_1` unique index already on this
     * collection.
     */
    employeeId: { type: String, required: true, unique: true, trim: true },
    phone: { type: String, trim: true },
    /** `YYYY-MM-DD`. A date, not a Date: it is a calendar fact with no time or
     *  timezone, and storing it as a Date invites a UTC shift to move someone's
     *  hire date a day earlier for everyone west of Manila. */
    dateHired: { type: String, trim: true },
  },
  { timestamps: true }
);

collectorSchema.methods.comparePassword = function comparePassword(plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

collectorSchema.statics.createWithPassword = async function createWithPassword({
  password,
  ...rest
}) {
  const passwordHash = await bcrypt.hash(password, 10);
  return this.create({ ...rest, passwordHash });
};

collectorSchema.statics.findByEmail = function findByEmail(email) {
  return this.findOne({ email: String(email).toLowerCase().trim() });
};

// Never serialise the password hash back to a client.
collectorSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    return ret;
  },
});

module.exports = mongoose.model('Collector', collectorSchema);
