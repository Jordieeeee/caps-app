const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    type: {
      type: String,
      enum: ['service-update', 'advisory', 'interruption'],
      required: true,
    },
    content: { type: String, required: true },
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'low' },
    zone: { type: String }, // optional zone-specific filtering
    date: { type: String },
  },
  { timestamps: true }
);

announcementSchema.statics.listByFilter = function listByFilter(filter = {}) {
  return this.find(filter).sort({ createdAt: -1 });
};

module.exports = mongoose.model('Announcement', announcementSchema);
