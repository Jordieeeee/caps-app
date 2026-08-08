const mongoose = require('mongoose');

/**
 * The Admin Portal's service-connection registry — READ ONLY from this backend.
 *
 * This is the join nobody wrote down. `Account.consumerIds` looks like the link
 * between a meter and the household on it, and in the live district database every
 * one of those references is dangling: ten accounts point at ten consumer ids, and
 * none of the ten documents exist. They are leftovers from this repo's own seed
 * script, which creates a Consumer per account; the portal creates its consumers in
 * its own registry and links them here instead, keyed on `accountNo`.
 *
 * So a route list built on `consumerIds` shows an account number where every
 * consumer's name should be. This model is what makes GET /accounts/route able to
 * say who lives at a stop.
 *
 * `serviceAddress` is the second reason it matters, and the subtler one: it is
 * where the *meter* is. `Consumer.mailingAddress` is where the *bill* goes, and for
 * a landlord, a business with a head office, or anyone billed care-of a relative,
 * those are different barangays. A collector walks to the meter. Grouping a route
 * by the billing address would send them to the wrong side of the city with a
 * perfectly consistent-looking screen.
 *
 * Declared narrowly on purpose. Every field below is one this backend reads; none
 * is written. Under `strict: true` an undeclared path cannot be written at all, so
 * the portal's registry cannot be altered from here even by accident — the same
 * structural guarantee documented at length in models/Consumer.js.
 */

const serviceAddressSchema = new mongoose.Schema(
  {
    houseStreet: { type: String, trim: true },
    barangay: { type: String, trim: true },
    city: { type: String, trim: true },
    province: { type: String, trim: true },
    zip: { type: String, trim: true },
  },
  { _id: false }
);

const serviceConnectionSchema = new mongoose.Schema(
  {
    /** Matches `Account.accountNumber` exactly, e.g. `ACC-2026-0001`. */
    accountNo: { type: String, index: true },
    consumerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Consumer' },
    accountType: { type: String },
    /**
     * The portal's own vocabulary, passed through rather than translated —
     * `pending_installation` is the only value present in the district database
     * today, and inventing a mapping for values that may never exist is how a
     * collector ends up being warned about a state nobody meant.
     */
    status: { type: String },
    serviceAddress: { type: serviceAddressSchema, default: undefined },
    zoneId: { type: mongoose.Schema.Types.ObjectId },
    dateConnected: { type: Date },
  },
  { timestamps: true, collection: 'serviceconnections' }
);

module.exports = mongoose.model('ServiceConnection', serviceConnectionSchema);
