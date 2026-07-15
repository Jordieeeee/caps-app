const mongoose = require('mongoose');

const billingSchema = new mongoose.Schema(
  {
    accountNumber: { type: String, required: true, index: true },
    billingPeriod: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    dueDate: { type: String, required: true },
    status: { type: String, enum: ['paid', 'pending', 'overdue'], default: 'pending' },
    paymentDate: { type: String },
    paymentMethod: { type: String },
  },
  { timestamps: true }
);

billingSchema.statics.listByAccount = function listByAccount(accountNumber) {
  return this.find({ accountNumber }).sort({ dueDate: -1 });
};

module.exports = mongoose.model('Billing', billingSchema);
