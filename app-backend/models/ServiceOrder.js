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
  },
  { timestamps: true }
);

serviceOrderSchema.statics.upsertFromClient = function upsertFromClient(data) {
  const { clientId, ...rest } = data;
  return this.findOneAndUpdate(
    { clientId },
    { $set: { clientId, ...rest } },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
  );
};

serviceOrderSchema.statics.listByFilter = function listByFilter(filter = {}) {
  return this.find(filter).sort({ createdAt: -1 });
};

module.exports = mongoose.model('ServiceOrder', serviceOrderSchema);
