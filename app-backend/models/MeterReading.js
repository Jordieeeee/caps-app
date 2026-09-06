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

    /**
     * ── The portal's own reading shape, stamped onto the same document ──────────
     *
     * ⚠️ WITHOUT THESE, A COLLECTOR'S READING WAS A DEAD END. `meterreadings` holds
     * two document shapes (see utils/previousReading.js): the app's, keyed on
     * `accountNumber`, and the portal's, keyed on `connectionId` and carrying a
     * `status` its reading queue filters on. This app wrote only the first, so a
     * reading synced from a handset was invisible to the portal — it never entered
     * the approval queue, never reached a billing run, and never became a bill. The
     * consumer's app reads `bills` and nothing else, so the household saw no trace
     * of a meter that had been read that morning.
     *
     * Verified against the district's data on 2026-09-04: ACC-2026-0007 was read at
     * 13:23 (103 → 150, 47 m³) and the consumer's screen thirteen minutes later
     * still showed August's ₱200.00 / 10 m³, because nothing downstream of the sync
     * endpoint could see the reading.
     *
     * These fields do not replace the app's — they ride alongside, on one document,
     * so there is exactly one record of one visit to one meter. `previousReading.js`
     * still resolves it through its `app` branch (that branch tests `accountNumber`
     * first and both are present), which is what keeps the collector's own next
     * previous-reading unchanged by this addition.
     *
     * Writes stay one-directional: this backend files a reading for review and never
     * approves one. `status` moves to APPROVED in the portal, by a person.
     */

    /** The `serviceconnections._id` this reading belongs to — the portal's key. */
    connectionId: { type: mongoose.Schema.Types.ObjectId, index: true },
    /** The installed meter, where the portal has one on this connection. */
    meterId: { type: mongoose.Schema.Types.ObjectId },
    /**
     * Consumption in the portal's field name. The same number as `consumption`,
     * duplicated rather than renamed because both readers are real: the portal's
     * queue reads this one, the app's history reads the other, and a migration that
     * renamed the field would blind whichever side was not updated in the same
     * deploy.
     */
    consumptionCuM: { type: Number },
    /**
     * `PENDING` | `APPROVED` | `REJECTED` — the portal's review state.
     *
     * Written as PENDING **on insert only** (`$setOnInsert`, see `upsertFromClient`).
     * A replayed outbox must never walk an approval backwards: the phone re-sends a
     * reading whenever it is unsure the first attempt landed, and a `$set` here
     * would silently un-approve a reading the office had already signed off.
     */
    status: { type: String, default: null },
    /** Where the reading came from, in the portal's vocabulary. */
    source: { type: String, default: null },
    /** The portal's rejection flag; `previousReading.js` already filters on it. */
    isRejected: { type: Boolean, default: false },
    rejectionReason: { type: String, default: null },

    /**
     * Earlier readings of this meter-month, kept because the database will not let
     * them be rows of their own.
     *
     * ⚠️ THIS EXISTS BECAUSE OF AN INDEX THIS SCHEMA DOES NOT DECLARE. The live
     * collection carries `connectionId_1_period_1` as UNIQUE — added by the portal,
     * not by us, to stop one meter-month reaching billing twice. `supersededBy` and
     * `resolvePeriod` below were written on the opposite assumption: that a re-read
     * lands as a second document and the two are arbitrated afterwards. Both cannot
     * be true, and the index wins, so every correction a collector filed was
     * refused at the wire with `E11000 duplicate key` and sat in the phone's outbox
     * for good.
     *
     * So a correction is merged onto the standing document instead, and what it
     * replaced is recorded here. Nothing the collector measured is discarded: this
     * is the audit trail `supersededBy` used to provide, in the only shape the
     * index permits.
     *
     * Empty for the ordinary case. A meter read once in a month never has one.
     */
    revisions: {
      type: [
        {
          _id: false,
          clientId: String,
          collectorId: String,
          routeId: String,
          previousReading: Number,
          currentReading: Number,
          consumption: Number,
          readingDate: String,
          clientTimestamp: Number,
          /** When this version stopped being the one that stands. */
          recordedAt: Date,
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

/**
 * Why a reading was rejected without anybody rejecting it.
 *
 * A superseded reading has to leave the portal's queue, or a re-read puts two
 * readings for one meter-month in front of an approver and the district bills the
 * household twice — the exact failure `supersededBy` was added to prevent, moved
 * one system downstream. The reason is spelled out because an approver seeing
 * "REJECTED" on a collector's work deserves to know it was arithmetic, not a
 * judgement on their reading.
 */
const SUPERSEDED_REASON =
  'Superseded by a later reading of the same meter in the same period.';

/**
 * Is this the duplicate-key error from the portal's meter-month index?
 *
 * Read off `keyPattern` rather than matched against the message string: the index
 * can be renamed, its fields cannot, and a message match would quietly stop
 * working the day someone rebuilds it under another name.
 */
function isPeriodConflict(error) {
  if (!error || error.code !== 11000) return false;
  const key = error.keyPattern || {};
  return 'connectionId' in key && 'period' in key;
}

/**
 * The fields a correction replaces — what the collector measured, and who filed it.
 *
 * Review state is deliberately absent. `status`, `isRejected` and `rejectionReason`
 * belong to the office, and a phone re-sending a reading must not reset a decision
 * a person already made. Same reasoning as the `$setOnInsert` split below.
 * `connectionId` and `period` are absent because they are the key being merged on.
 */
const MEASUREMENT_FIELDS = [
  'clientId',
  'routeId',
  'collectorId',
  'accountNumber',
  'previousReading',
  'currentReading',
  'consumption',
  'readingDate',
  'notes',
  'photoUri',
  'clientTimestamp',
  'meterId',
  'consumptionCuM',
  'source',
];

/**
 * Which of two readings of one meter-month stands.
 *
 * `clientTimestamp` first, exactly as `resolvePeriod` ranks: it is the phone's
 * clock at the meter, and the only field that describes when the reading was
 * TAKEN. `createdAt` is when signal came back and can order a correction before
 * the thing it corrects, so it is a tiebreak and never the rule; an incoming
 * reading has none yet, which makes it lose a tie to the record already stored and
 * keeps the outcome the same however a queue is replayed.
 */
function isLaterThan(candidate, incumbent) {
  const rank = (r) => [
    r.clientTimestamp || 0,
    new Date(r.createdAt || 0).getTime(),
    r.clientId || '',
  ];
  const [at, ac, ai] = rank(candidate);
  const [bt, bc, bi] = rank(incumbent);
  if (at !== bt) return at > bt;
  if (ac !== bc) return ac > bc;
  return ai > bi;
}

function snapshotOf(source) {
  return {
    clientId: source.clientId ?? null,
    collectorId: source.collectorId ?? null,
    routeId: source.routeId ?? null,
    previousReading: source.previousReading ?? null,
    currentReading: source.currentReading ?? null,
    consumption: source.consumption ?? null,
    readingDate: source.readingDate ?? null,
    clientTimestamp: source.clientTimestamp ?? null,
    recordedAt: new Date(),
  };
}

/**
 * Fold a correction onto the reading that already holds this meter-month.
 *
 * Returns the document that stands afterwards, whichever of the two that is — an
 * out-of-order arrival is recorded and does NOT take over. Idempotent: replaying a
 * reading already logged in `revisions` changes nothing and still succeeds, which
 * is what lets the phone clear it from its outbox.
 */
meterReadingSchema.statics.mergeIntoPeriod = async function mergeIntoPeriod(data) {
  const standing = await this.findOne({
    connectionId: data.connectionId,
    period: data.period,
  });
  if (!standing) return null;

  if (standing.clientId === data.clientId) return standing;
  if ((standing.revisions || []).some((r) => r.clientId === data.clientId)) {
    return standing;
  }

  if (isLaterThan(data, standing)) {
    standing.revisions.push(snapshotOf(standing));
    for (const field of MEASUREMENT_FIELDS) {
      if (data[field] !== undefined) standing[field] = data[field];
    }
  } else {
    standing.revisions.push(snapshotOf(data));
  }

  await standing.save();
  return standing;
};

/**
 * File a reading from the phone, idempotently on its `clientId`.
 *
 * The review fields are split out of `$set` deliberately. Everything the collector
 * measured is overwritten on every replay — it is the same measurement, and a
 * corrected body should win. The review state is `$setOnInsert`, so it is written
 * once when the record first arrives and never again: a retry from an outbox that
 * did not hear the first response must not reset an approval the office has since
 * made, and `status` is the field the portal's queue and its billing run key on.
 */
meterReadingSchema.statics.upsertFromClient = async function upsertFromClient(data) {
  const { clientId, ...rest } = data;

  let reading;
  try {
    reading = await this.findOneAndUpdate(
      { clientId },
      {
        $set: { clientId, ...rest },
        $setOnInsert: { status: 'PENDING', isRejected: false, rejectionReason: null },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    );
  } catch (error) {
    if (!isPeriodConflict(error)) throw error;

    /**
     * ⚠️ NO `connectionId`, NO MERGE. THIS GUARD IS NOT OPTIONAL.
     *
     * `connectionId_1_period_1` is a plain unique index, so a MISSING field indexes
     * as null and every reading whose account did not resolve to a service
     * connection shares one key per period — 47 of the 73 readings in this
     * collection have no `connectionId` at all. Merging on a null key would fold
     * two unrelated households' meters into a single document and hand the office a
     * reading attributed to the wrong address.
     *
     * A collision between two unresolved accounts is a different fault with a
     * different fix (the index wants to be partial), so it is raised rather than
     * quietly absorbed.
     */
    if (!data.connectionId) throw error;

    reading = await this.mergeIntoPeriod(data);
    // Lost a race with another sync of the same meter-month; the caller may retry.
    if (!reading) throw error;
  }

  /**
   * Backfill for the readings already in the collection.
   *
   * Every reading this app has ever synced predates `status`, so `$setOnInsert`
   * cannot reach them — they would sit in the database with the portal's key fields
   * present and no review state, which reads to the queue as neither pending nor
   * approved. Conditioned on the field being absent so it can never touch a record
   * a person has decided on.
   */
  if (reading.status == null) {
    await this.updateOne(
      { _id: reading._id, status: null },
      { $set: { status: 'PENDING', isRejected: false, rejectionReason: null } }
    );
    reading.status = 'PENDING';
    reading.isRejected = false;
  }

  return reading;
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
      await this.reinstate(group[0]._id);
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
    this.reinstate(winner._id),
    /**
     * Superseded readings leave the portal's queue as well as the app's history.
     *
     * Marking them rejected here is what keeps a correction from becoming a second
     * bill one system downstream: without it an approver is handed both halves of a
     * re-read, and approving both bills the household twice for one month. The mark
     * is reversible — see `reinstate` — because which reading stands is recomputed
     * from the whole group on every sync, and an out-of-order arrival can change the
     * answer.
     */
    this.updateMany(
      { _id: { $ne: winner._id }, accountNumber, period },
      { $set: { supersededBy: winner.clientId } }
    ),
  ]);

  /**
   * Second pass, and it must not be folded into the one above.
   *
   * A loser that a PERSON rejected keeps their reason. Stamping this file's
   * sentence over "Meter face obscured" would lose what the office actually
   * observed — and worse, it would make that record match `reinstate`'s filter, so
   * a later re-resolution could quietly un-reject a reading a human threw out. The
   * bookkeeping above applies to every loser; this applies only to the ones nobody
   * has ruled on.
   */
  await this.updateMany(
    {
      _id: { $ne: winner._id },
      accountNumber,
      period,
      $or: [{ isRejected: { $ne: true } }, { rejectionReason: SUPERSEDED_REASON }],
    },
    { $set: { status: 'REJECTED', isRejected: true, rejectionReason: SUPERSEDED_REASON } }
  );

  return winner;
};

/**
 * Undo a supersede-rejection, and only ever that one.
 *
 * Conditioned on `rejectionReason` matching the sentence this file writes, so a
 * reading a *person* rejected in the portal stays rejected however the readings
 * around it are reshuffled. Their judgement outranks this arithmetic, and there is
 * no path here that can overwrite it.
 */
meterReadingSchema.statics.reinstate = function reinstate(id) {
  return this.updateOne(
    { _id: id, rejectionReason: SUPERSEDED_REASON },
    { $set: { status: 'PENDING', isRejected: false, rejectionReason: null } }
  );
};

module.exports = mongoose.model('MeterReading', meterReadingSchema);
