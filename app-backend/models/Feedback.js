const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema(
  {
    consumerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Consumer', required: true },
    type: {
      type: String,
      enum: ['billing', 'service-quality', 'system-issue', 'other'],
      required: true,
    },
    /**
     * Trimmed and bounded server-side, not just in the form.
     *
     * `requireFields` rejects '' but passes '   ', so a whitespace-only subject
     * would have created a blank row in the district's triage queue. `trim` turns
     * that back into '' and `required` then rejects it. The ceilings are what a
     * human writes, generously: without one, `message` accepts a body as large as
     * the JSON parser allows and it lands in a list view staff have to read.
     */
    subject: { type: String, required: true, trim: true, maxlength: 200 },
    message: { type: String, required: true, trim: true, maxlength: 5000 },
    status: { type: String, enum: ['open', 'in-review', 'resolved'], default: 'open' },
  },
  { timestamps: true }
);

feedbackSchema.statics.listByConsumer = function listByConsumer(consumerId) {
  return this.find({ consumerId }).sort({ createdAt: -1 });
};

module.exports = mongoose.model('Feedback', feedbackSchema);
