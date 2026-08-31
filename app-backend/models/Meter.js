const mongoose = require('mongoose');

/**
 * The Admin Portal's meter registry — READ ONLY from this backend.
 *
 * Declared for one field: `serialNo`, the number stamped on the box the collector
 * is standing in front of. `GET /accounts/route` sent `meterNumber: ''` for every
 * stop in the district behind a comment saying this collection was empty, which was
 * true when it was written and is not true now — the portal installs meters here,
 * against a `connectionId`, and the app has been rendering "Not on file" over the
 * top of real serials.
 *
 * It matters more than a label. The serial is how a collector confirms they are
 * reading the right meter before they type a number into a screen that will bill
 * somebody for it — several households share a wall of meter boxes, and the account
 * number is on the paperwork, not on the box.
 *
 * `removalDate` is declared because a removed meter must never be shown: a serial
 * that is no longer on the wall reads as confirmation of the wrong box, which is
 * worse than showing nothing at all.
 *
 * Narrow and `strict: true`, like every other portal-owned collection this backend
 * touches — an undeclared path cannot be written, so the registry cannot be altered
 * from here even by accident. See models/ServiceConnection.js.
 */
const meterSchema = new mongoose.Schema(
  {
    /** e.g. `MTR-2026-0001`. The number physically stamped on the meter. */
    serialNo: { type: String },
    connectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceConnection', index: true },
    brand: { type: String },
    status: { type: String },
    installDate: { type: Date },
    /** Null while the meter is on the wall. Set when it is taken off. */
    removalDate: { type: Date, default: null },
  },
  { timestamps: true, collection: 'meters', autoIndex: false, strict: true }
);

module.exports = mongoose.model('Meter', meterSchema);
