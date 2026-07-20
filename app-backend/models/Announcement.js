const mongoose = require('mongoose');

/**
 * The Admin Portal's CMS store — READ-ONLY from this backend.
 *
 * Same shadow-collection problem the bills had: this model declared its own shape
 * and defaulted to `announcements`, which nothing writes. The portal publishes
 * notices into `cmscontents` with different field names, so mobile queried an empty
 * collection and the Notices screen fell back to mock.
 *
 * Real shape, from the live document:
 *   category     service_interruption | advisory | update   (snake_case)
 *   body         the text            NOT `content`
 *   status       draft | published
 *   targetAudience  consumers | collectors | all
 *   publishedAt  Date                NOT `date`
 *
 * There is no `priority` and no `zone` in the real data. The mobile UI renders a
 * priority badge and the old model had a zone filter; both were mock-only inventions
 * (see PRIORITY_BY_CATEGORY in the controller for how the badge is now derived).
 */
const announcementSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    category: {
      type: String,
      enum: ['service_interruption', 'advisory', 'update'],
      required: true,
    },
    body: { type: String, required: true },
    status: { type: String, enum: ['draft', 'published'], default: 'draft' },
    targetAudience: { type: String, enum: ['consumers', 'collectors', 'all'], default: 'all' },
    publishedAt: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { collection: 'cmscontents', timestamps: true, autoIndex: false, strict: true }
);

/**
 * Published notices for one audience, newest published first.
 *
 * Both gates matter. `status: 'published'` keeps drafts out — an unfinished
 * interruption notice reaching consumers would have the district announcing an
 * outage it had not decided on. The audience gate keeps collector-facing operational
 * notes off consumer phones.
 *
 * Sorted by `publishedAt`, not `createdAt`: a notice drafted last week and published
 * this morning is today's news and belongs at the top.
 */
announcementSchema.statics.listPublishedFor = function listPublishedFor(audience) {
  return this.find({
    status: 'published',
    targetAudience: { $in: [audience, 'all'] },
  }).sort({ publishedAt: -1 });
};

module.exports = mongoose.model('Announcement', announcementSchema);
