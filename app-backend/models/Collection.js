const mongoose = require('mongoose');

const collectionSchema = new mongoose.Schema(
  {
    // Client-generated id; unique for idempotent offline sync.
    clientId: { type: String, required: true, unique: true },
    collectorId: { type: String, required: true },
    accountNumber: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    paymentMethod: { type: String, enum: ['cash', 'check', 'electronic'], required: true },
    collectionDate: { type: String, required: true },
    receiptNumber: { type: String },
    clientTimestamp: { type: Number },
  },
  { timestamps: true }
);

collectionSchema.statics.upsertFromClient = function upsertFromClient(data) {
  const { clientId, ...rest } = data;
  return this.findOneAndUpdate(
    { clientId },
    { $set: { clientId, ...rest } },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
  );
};

collectionSchema.statics.listByFilter = function listByFilter(filter = {}) {
  return this.find(filter).sort({ createdAt: -1 });
};

module.exports = mongoose.model('Collection', collectionSchema);
