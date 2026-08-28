const mongoose = require('mongoose');

/**
 * Which zone an employment is currently assigned to — READ-ONLY.
 *
 * History is kept: a row per assignment with `endDate` and a `status`, so a
 * transfer leaves the old row behind. Only `status: 'current'` describes where
 * someone works now.
 *
 * Display only, like `Collector.zone` before it. A zone is an area label ("Zone
 * 5"), never an identifier for filtering work — see models/Employment.js.
 */
const zoneAssignmentSchema = new mongoose.Schema(
  {
    employmentId: { type: mongoose.Schema.Types.ObjectId, required: true },
    zoneId: { type: mongoose.Schema.Types.ObjectId, required: true },
    assignedDate: Date,
    endDate: { type: Date, default: null },
    status: String,
  },
  { collection: 'zoneassignments', autoIndex: false, strict: true }
);

module.exports = mongoose.model('ZoneAssignment', zoneAssignmentSchema);
