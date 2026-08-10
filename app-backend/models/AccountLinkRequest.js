const mongoose = require('mongoose');

/**
 * A consumer asking TWD to attach a water account to their profile.
 *
 * This collection is owned by the mobile backend — unlike `consumers`,
 * `serviceconnections` and `bills`, which belong to the Admin Portal and are
 * read-only from here. It exists because the two systems needed somewhere to meet:
 * the consumer can ask from the app, and only the office can decide.
 *
 * ⚠️ A REQUEST IS A MESSAGE, NOT A LINK. Approving one does not and cannot create
 * the connection from this backend — `serviceconnections` is the portal's registry
 * and is structurally unwritable from here (see models/ServiceConnection.js). Staff
 * approve by making the link in the portal; `status` is then the record of what they
 * decided, and GET /accounts picks the new account up on its own because it reads
 * that registry directly. Nothing in this file ever grants access to anything.
 *
 * Why the request exists at all rather than self-service linking: account numbers
 * are sequential and printed on every bill posted through a door, so any check this
 * backend could apply is one an attacker passes too. The verification is a human
 * one. See `createLinkRequest` in controllers/accountController.js for the property
 * that makes filing a request safe — the response cannot be used to discover
 * whether an account number exists.
 */
const accountLinkRequestSchema = new mongoose.Schema(
  {
    /** Always the caller's own id, taken from the token — never from the body. */
    consumerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Consumer',
      required: true,
      index: true,
    },
    /** Normalised to upper case on write so `acc-2026-0001` and `ACC-2026-0001`
        cannot both sit in the queue as separate requests. */
    accountNumber: { type: String, required: true, trim: true, uppercase: true },
    /** Optional free text from the consumer — "this is my mother's meter", etc. */
    note: { type: String, trim: true, maxlength: 500 },
    /**
     * `pending` and `cancelled` are written here (the consumer files and withdraws).
     * `approved` and `rejected` are the office's, written by the portal.
     */
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'cancelled'],
      default: 'pending',
      index: true,
    },
    /** When staff decided. Null while pending — never backfilled from `updatedAt`. */
    decidedAt: { type: Date },
    /**
     * Which staff account decided. Deliberately never sent to the consumer — see
     * `present()` in controllers/accountController.js.
     */
    decidedBy: { type: mongoose.Schema.Types.ObjectId },
  },
  { timestamps: true, collection: 'accountlinkrequests' }
);

/**
 * One pending request per consumer per account, enforced by the database.
 *
 * Partial, so it constrains only `pending` rows: a consumer whose request was
 * rejected must be able to ask again after sorting it out at the office, and a
 * unique index over every status would block that forever. The controller checks
 * for a duplicate before inserting; this index is what makes two taps arriving
 * together produce one queue entry instead of two.
 */
accountLinkRequestSchema.index(
  { consumerId: 1, accountNumber: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } }
);

accountLinkRequestSchema.statics.listByConsumer = function listByConsumer(consumerId) {
  return this.find({ consumerId }).sort({ createdAt: -1 });
};

accountLinkRequestSchema.statics.countPending = function countPending(consumerId) {
  return this.countDocuments({ consumerId, status: 'pending' });
};

module.exports = mongoose.model('AccountLinkRequest', accountLinkRequestSchema);
