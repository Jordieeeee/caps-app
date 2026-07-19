const mongoose = require('mongoose');

const accountSchema = new mongoose.Schema(
  {
    accountNumber: { type: String, required: true, unique: true },
    address: { type: String, required: true },
    type: { type: String, enum: ['residential', 'commercial', 'government'], required: true },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    // outstanding/paymentStatus are NOT stored here — they're derived from Billing
    // records on read (see utils/accountPaymentSummary.js), so there is exactly one
    // source of truth and no risk of a stale balance surviving a payment.
    // Consumers who have linked this account (a shared meter may have several).
    consumerIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Consumer' }],
    linkedDate: { type: String },
  },
  { timestamps: true }
);

accountSchema.statics.findByConsumer = function findByConsumer(consumerId) {
  return this.find({ consumerIds: consumerId }).sort({ createdAt: -1 });
};

accountSchema.statics.linkConsumer = function linkConsumer(accountNumber, consumerId) {
  return this.findOneAndUpdate(
    { accountNumber },
    { $addToSet: { consumerIds: consumerId } },
    { new: true }
  );
};

accountSchema.statics.unlinkConsumer = function unlinkConsumer(accountNumber, consumerId) {
  return this.findOneAndUpdate(
    { accountNumber },
    { $pull: { consumerIds: consumerId } },
    { new: true }
  );
};

module.exports = mongoose.model('Account', accountSchema);
