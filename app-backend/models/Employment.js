const mongoose = require('mongoose');

/**
 * The JOB, as the Admin Portal records it — READ-ONLY from this backend.
 *
 * One row per posting: which person, their employee number, when they were
 * hired, whether they have been separated, and (on newer rows) which routes they
 * walk. This is the document the mobile app should anchor a collector to rather
 * than the person: employee numbers, zone assignments and separation all hang
 * off employment, and it survives edits to the person record.
 *
 * ⚠️ `routeIds` is present on newly created rows only — five of six have none.
 * A collector with no routes is not an error; the app already renders "No routes
 * assigned". Do not invent one from the zone: a zone is an area label and a
 * route is what stamps a meter reading, and conflating them would file work
 * under a route the office never issued.
 */
const employmentSchema = new mongoose.Schema(
  {
    personId: { type: mongoose.Schema.Types.ObjectId, required: true },
    /** e.g. "COL-26-006". The portal's own employee number. */
    employeeNo: String,
    dateHired: Date,
    dateSeparated: { type: Date, default: null },
    separationReason: { type: String, default: null },
    status: String,
    routeIds: [String],
  },
  { collection: 'employments', autoIndex: false, strict: true, timestamps: true }
);

/** Employed today: the portal's own status, plus no separation date. */
employmentSchema.statics.isActive = function isActive(employment) {
  return Boolean(employment) && employment.status === 'active' && !employment.dateSeparated;
};

module.exports = mongoose.model('Employment', employmentSchema);
