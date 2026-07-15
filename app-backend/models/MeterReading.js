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
  return this.find(filter).sort({ createdAt: -1 });
};

module.exports = mongoose.model('MeterReading', meterReadingSchema);
