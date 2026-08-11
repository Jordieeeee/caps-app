const mongoose = require('mongoose');

/**
 * A message addressed to one consumer, in this backend's own collection.
 *
 * ⚠️ THIS MODEL USED TO READ THE ADMIN PORTAL'S STAFF FEED. With no `collection:`
 * set, Mongoose pluralised the model name and pointed it at `notifications` — which
 * exists, holds 11 documents, and is **not this**. Every row there is
 * `recipientRole: 'admin'`; a census on 2026-08-11 found zero addressed to a
 * consumer and no `consumerId` field anywhere in the collection. The documents are
 * back-office events, with a shape that shares only `message` with the schema below:
 *
 *     { type: 'batch_billing', title: 'Batch Billing Success', isRead: true,
 *       message: 'Batch billing "verification_batch_1.csv" completed successfully.
 *                 Success: 4, Failed: 0',
 *       relatedModel: 'BatchBillingLog', recipientRole: 'admin' }
 *
 * `listByConsumer` filters on `consumerId`, which matches none of them, so the
 * endpoint returned `[]` and the mismatch stayed invisible. That is the dangerous
 * part: an empty inbox reads as "no messages yet", and the obvious way to "fix" it
 * is to loosen the filter — which would put the district's batch-billing logs in
 * front of consumers. Pinning the collection is what makes that impossible rather
 * than merely unlikely.
 *
 * `consumernotifications` is owned by this backend, like `accountlinkrequests` and
 * unlike `bills` / `cmscontents` / `serviceconnections` (see models/Billing.js for
 * the same failure found the other way round — a real collection under a name
 * nothing wrote). NOTHING WRITES IT YET, so the inbox is empty by construction
 * until the portal issues consumer notifications or a hook here creates one on
 * bill issuance. Empty because there is nothing to say is honest; empty because we
 * are reading someone else's mail is not.
 */
const notificationSchema = new mongoose.Schema(
  {
    consumerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Consumer', required: true },
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
  { collection: 'consumernotifications', timestamps: true, strict: true }
);

notificationSchema.statics.listByConsumer = function listByConsumer(consumerId) {
  return this.find({ consumerId }).sort({ createdAt: -1 });
};

notificationSchema.statics.markRead = function markRead(id, consumerId) {
  return this.findOneAndUpdate({ _id: id, consumerId }, { $set: { read: true } }, { new: true });
};

module.exports = mongoose.model('Notification', notificationSchema);
