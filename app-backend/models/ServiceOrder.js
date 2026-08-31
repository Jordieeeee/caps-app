const mongoose = require('mongoose');

const serviceOrderSchema = new mongoose.Schema(
  {
    // Client-generated id; unique for idempotent offline sync.
    clientId: { type: String, required: true, unique: true },
    type: { type: String, enum: ['reconnection', 'disconnection'], required: true },
    accountNumber: { type: String, required: true },
    accountAddress: { type: String },
    reason: { type: String },
    status: { type: String, enum: ['pending', 'completed', 'cancelled'], default: 'pending' },
    fieldVerification: { type: String },
    completionDate: { type: String },
    clientTimestamp: { type: Number },
    /**
     * Which collector filed the completion. Stamped by the controller from the
     * resolved auth scope, never from the body.
     *
     * Optional, unlike MeterReading.collectorId, because an order does not have one
     * for most of its life: the office raises it unassigned and any collector may
     * take it. It is only answerable once somebody has stood at the gate — and
     * until this existed, nothing anywhere recorded who turned the water off. The
     * printed slip carried the collector's name; the district's own copy did not.
     */
    completedBy: { type: String },
    /**
     * Which staff member authorised the order, as a `users._id`.
     *
     * ⚠️ WRITTEN BY THE PORTAL, NEVER BY THIS BACKEND OR BY A HANDSET. The sync
     * endpoint strips it from the request body before upserting — a phone that could
     * name its own authoriser would make the field worthless, which is the same
     * reason `completedBy` is taken from the auth token instead of the payload.
     *
     * The requirement is "authorized disconnect orders", and until this existed
     * nothing recorded an authorisation at all: an order named the collector who
     * carried it out and nobody who approved it. If a household disputes a
     * disconnection six months later, that is the missing half of the record.
     *
     * Same shape the portal already uses for this — `connectionstatushistories`
     * stamps `changedBy` with a `users._id` — so the join needs no translation.
     */
    authorisedBy: { type: String },
  },
  { timestamps: true }
);

/**
 * Apply a phone's copy of an order, without ever un-cancelling one.
 *
 * A plain upsert on `clientId` wrote whatever the handset sent, so a collector
 * confirming an order the office had withdrawn flipped `status` from `cancelled`
 * straight back to `completed` — the withdrawal disappeared from the only record
 * of it, and the district's copy then said the disconnection was authorised work.
 * The app no longer offers that button (see service-orders.ts), but sync replays a
 * queue built before a cancellation could have been known about, so the guard has
 * to live here too: the phone is authoritative about what happened at the gate, and
 * the office is authoritative about whether it should have.
 *
 * So a completion arriving against a cancelled order is *recorded, not applied*.
 * The field report — who, when, what they found — is stored, and `status` stays
 * `cancelled`. A cancelled order carrying a completion report is exactly the pair
 * of facts the office needs to see, and neither one erases the other.
 *
 * The two writes are ordered so the common path is one round trip and the race is
 * closed: the first matches only orders that are not cancelled, so a cancellation
 * landing mid-sync makes it miss rather than overwrite.
 */
serviceOrderSchema.statics.upsertFromClient = async function upsertFromClient(data) {
  const { clientId, ...rest } = data;

  const applied = await this.findOneAndUpdate(
    { clientId, status: { $ne: 'cancelled' } },
    { $set: { clientId, ...rest } },
    { new: true, runValidators: true }
  );
  if (applied) return applied;

  // No match: either the office cancelled this order, or this server has never
  // seen it. `status` moves to $setOnInsert so it applies to the second case and
  // not the first — an insert keeps the client's status, a cancelled order keeps
  // its own and takes only the report.
  const { status, ...report } = rest;
  return this.findOneAndUpdate(
    { clientId },
    { $set: { clientId, ...report }, $setOnInsert: { status: status || 'pending' } },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
  );
};

serviceOrderSchema.statics.listByFilter = function listByFilter(filter = {}) {
  return this.find(filter).sort({ createdAt: -1 });
};

module.exports = mongoose.model('ServiceOrder', serviceOrderSchema);
