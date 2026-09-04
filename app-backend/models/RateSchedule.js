const mongoose = require('mongoose');

/**
 * The Admin Portal's tariff — READ-ONLY from this backend.
 *
 * ⚠️ THE COLLECTOR'S RECEIPT WAS BILLING AT RATES TWD DOES NOT CHARGE. The app
 * carries its own table in `src/shared/utils/billing-calculator.ts`, under a TODO
 * saying every figure in it was a placeholder from the spec, and it has never
 * matched this collection:
 *
 *                      app placeholder      portal (residential, in force)
 *   minimum charge     ₱140 (0–10 m³)       ₱200 (≤10 m³)
 *   11–20 m³           ₱21/m³               ₱25/m³
 *   21–30 m³           ₱36/m³               ₱35/m³
 *   31–40 m³           ₱43/m³               ₱50/m³ (31+, no fourth block)
 *   41+ m³             ₱48/m³               —
 *
 * On the 47 m³ reading taken at ACC-2026-0007 on 2026-09-04 the phone would print
 * ₱1,653.12 against a portal basic charge of ₱1,650.00, and the gap widens at every
 * other consumption. The receipt is handed over at the gate and paid against, so a
 * rate table that is nobody's rate table is the single most expensive thing in the
 * module to leave wrong.
 *
 * Serving it to the phone rather than copying the numbers into the app is the point:
 * a rate change is a board decision the district makes in the portal, and a
 * hardcoded copy is correct only until then, silently.
 *
 * `notes` on every document in this collection currently reads "PLACEHOLDER — not a
 * board-approved rate. Replace before production billing." That is the district's
 * own warning about its own data and it is passed through to the app unaltered.
 */

const bracketSchema = new mongoose.Schema(
  {
    /** First cubic metre this rate applies to. */
    from: { type: Number },
    /** Last cubic metre, or null for the open-ended top block. */
    to: { type: Number, default: null },
    ratePerCubicMeter: { type: Number },
  },
  { _id: false }
);

const feeSchema = new mongoose.Schema(
  {
    name: { type: String },
    /** `percentage` | `fixed`. */
    type: { type: String },
    value: { type: Number },
  },
  { _id: false }
);

const rateScheduleSchema = new mongoose.Schema(
  {
    /** `residential` | `commercial` | `government`, matching an account's type. */
    classification: { type: String, index: true },
    effectiveFrom: { type: Date },
    /** Null while this is the schedule in force. */
    effectiveTo: { type: Date, default: null },
    /** Cubic metres covered by `minimumCharge` before the brackets begin. */
    minimumConsumption: { type: Number },
    minimumCharge: { type: Number },
    brackets: { type: [bracketSchema], default: [] },
    fees: { type: [feeSchema], default: [] },
    penaltyPercentOnOverdueArrears: { type: Number },
    notes: { type: String },
  },
  { collection: 'rateschedules', timestamps: true, autoIndex: false, strict: true }
);

/**
 * The schedule in force per classification, at `now`.
 *
 * A schedule with no `effectiveFrom` is treated as always having been in force
 * rather than never: the district's own documents carry one, and excluding a
 * malformed record would silently fall the app back to its placeholder table, which
 * is the failure this model exists to end. Ties go to the later `effectiveFrom`.
 */
rateScheduleSchema.statics.inForce = async function inForce(now = new Date()) {
  const schedules = await this.find({
    $and: [
      { $or: [{ effectiveFrom: null }, { effectiveFrom: { $lte: now } }] },
      { $or: [{ effectiveTo: null }, { effectiveTo: { $gt: now } }] },
    ],
  })
    .sort({ effectiveFrom: 1 })
    .lean();

  const byClassification = new Map();
  for (const schedule of schedules) {
    if (!schedule.classification) continue;
    byClassification.set(String(schedule.classification).toLowerCase(), schedule);
  }
  return byClassification;
};

module.exports = mongoose.model('RateSchedule', rateScheduleSchema);
