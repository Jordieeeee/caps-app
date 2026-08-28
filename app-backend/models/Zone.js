const mongoose = require('mongoose');

/** A district zone (Z-1 … Z-7) — READ-ONLY. Display label only. */
const zoneSchema = new mongoose.Schema(
  {
    zoneCode: String,
    zoneName: String,
    isActive: Boolean,
  },
  { collection: 'zones', autoIndex: false, strict: true }
);

module.exports = mongoose.model('Zone', zoneSchema);
