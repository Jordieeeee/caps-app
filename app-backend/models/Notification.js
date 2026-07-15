const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    consumerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    accountNumber: { type: String },
    kind: {
      type: String,
      enum: ['due-reminder', 'payment-confirmation', 'service-alert', 'announcement'],
      required: true,
    },
    message: { type: String, required: true },
    amount: { type: Number },
    dueDate: { type: String },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

notificationSchema.statics.listByConsumer = function listByConsumer(consumerId) {
  return this.find({ consumerId }).sort({ createdAt: -1 });
};

notificationSchema.statics.markRead = function markRead(id, consumerId) {
  return this.findOneAndUpdate({ _id: id, consumerId }, { $set: { read: true } }, { new: true });
};

module.exports = mongoose.model('Notification', notificationSchema);
