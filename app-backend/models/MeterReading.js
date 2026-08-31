const mongoose = require('mongoose');

const meterReadingSchema = new mongoose.Schema(
  {
    // Client-generated id from the offline app; unique so replayed sync
    // items upsert instead of creating duplicates.
    clientId: { type: String, required: true, unique: true },
    routeId: { type: String, required: true },
    collectorId: { type: String, required: true },
    accountNumber: { type: String, required: true },
    previousReading: { type: Number, required: true },
    currentReading: { type: Number, required: true },
    consumption: { type: Number, required: true },
    readingDate: { type: String, required: true },
    notes: { type: String },
    photoUri: { type: String },
    clientTimestamp: { type: Number },
    /**
     * The billing period this reading belongs to, `YYYY-MM`, derived from
     * `readingDate` on the server. Stored rather than computed at query time so one
     * meter's readings for one month can be found in a single indexed lookup — see
     * `supersededBy`.
     */
    period: { type: String, index: true },
    /**
     * The clientId of the reading that REPLACED this one, or null if it stands.
     *
     * ⚠️ WITHOUT THIS, A CORRECTION WAS A SECOND BILL. Re-reading a meter generates
     * a fresh clientId on the phone (`newClientId('rdg')`), and sync is idempotent
     * on that id — so the corrected reading arrived as a NEW row rather than a
     * replacement, and TWD ended up holding several readings for one meter in one
     * month. That is not hypothetical: this collection holds thirty-four readings
     * that resolve to twelve account-periods, one of them with five.
     *
     * `clientId` stays the phone's idempotency key and nothing here weakens it — a
     * replayed queue still upserts to one row. This is the second, separate
     * question the sync path never asked: not "have I seen this record before" but
     * "is this record about a meter-month I already have". Marking rather than
     * deleting keeps the mistake auditable, which matters when the superseded
     * reading is the one a consumer was handed a receipt for.
     */
    supersededBy: { type: String, default: null, index: true },
  },
  { timestamps: true }
);

meterReadingSchema.statics.upsertFromClient = function upsertFromClient(data) {
  const { clientId, ...rest } = data;
  return this.findOneAndUpdate(
    { clientId },
    { $set: { clientId, ...rest } },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
  );
};

meterReadingSchema.statics.listByFilter = function listByFilter(filter = {}) {
  // Superseded readings are excluded by default: they are corrections' leftovers,
  // and a history that lists both halves of a correction shows a meter read twice.
  // `supersededBy` is explicitly queryable for anyone auditing what was replaced.
  const scoped = 'supersededBy' in filter ? filter : { ...filter, supersededBy: null };
  return this.find(scoped).sort({ createdAt: -1 });
};

/** `YYYY-MM` from a `YYYY-MM-DD` reading date. String work — no reparsing, no drift. */
meterReadingSchema.statics.periodOf = function periodOf(readingDate) {
  return typeof readingDate === 'string' && readingDate.length >= 7
    ? readingDate.slice(0, 7)
    : null;
};

/**
 * Resolve which reading stands for one meter-month, and mark the rest superseded.
 *
 * Run after every sync of a reading for that account and period. It is deliberately
 * order-independent: it looks at the whole group and recomputes the winner from
 * scratch, so a queue replayed out of order, twice, or interleaved with another
 * handset's sync converges on the same answer. An "if newer, overwrite" rule would
 * not — it depends on arrival order, which offline sync does not control.
 *
 * The winner is the reading the collector took LAST, by `clientTimestamp` — the
 * phone's clock at the meter, not `createdAt`, which is when signal came back and
 * can order a correction before the thing it corrects. A re-read IS the correction;
 * that is the only reason a second reading of the same meter in the same month
 * exists.
 */
meterReadingSchema.statics.resolvePeriod = async function resolvePeriod(
  accountNumber,
  period
) {
  if (!accountNumber || !period) return null;

  const group = await this.find({ accountNumber, period }).lean();
  if (group.length < 2) {
    // Nothing to resolve. Still clear a stale mark: a lone reading cannot be
    // superseded by anything, and one may have been left marked when its
    // replacement was removed.
    if (group.length === 1 && group[0].supersededBy) {
      await this.updateOne({ _id: group[0]._id }, { $set: { supersededBy: null } });
    }
    return group[0] || null;
  }

  const rank = (r) => [r.clientTimestamp || 0, new Date(r.createdAt || 0).getTime(), r.clientId || ''];
  const winner = group.reduce((best, row) => {
    const [bt, bc, bi] = rank(best);
    const [rt, rc, ri] = rank(row);
    if (rt !== bt) return rt > bt ? row : best;
    if (rc !== bc) return rc > bc ? row : best;
    return ri > bi ? row : best;
  });

  await Promise.all([
    this.updateOne({ _id: winner._id }, { $set: { supersededBy: null } }),
    this.updateMany(
      { _id: { $ne: winner._id }, accountNumber, period },
      { $set: { supersededBy: winner.clientId } }
    ),
  ]);

  return winner;
};

module.exports = mongoose.model('MeterReading', meterReadingSchema);
