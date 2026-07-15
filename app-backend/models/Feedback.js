const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema(
  {
    consumerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
      type: String,
      enum: ['billing', 'service-quality', 'system-issue', 'other'],
      required: true,
    },
    subject: { type: String, required: true },
    message: { type: String, required: true },
    status: { type: String, enum: ['open', 'in-review', 'resolved'], default: 'open' },
  },
  { timestamps: true }
);

feedbackSchema.statics.listByConsumer = function listByConsumer(consumerId) {
  return this.find({ consumerId }).sort({ createdAt: -1 });
};

module.exports = mongoose.model('Feedback', feedbackSchema);
