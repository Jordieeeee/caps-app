const Feedback = require('../models/Feedback');

/**
 * One feedback record as the app consumes it.
 *
 * Presented rather than returned raw, same as announcementController: the stored
 * document carries `consumerId` and `__v`, which are this backend's bookkeeping and
 * not the consumer's business, and it names its key `_id` while every type in the
 * client's consumer module expects `id`.
 *
 * `updatedAt` is exposed as `statusChangedAt` because that is the only thing that
 * can move it — the record's own fields are never edited after creation, so a
 * changed timestamp means staff advanced the status. It is deliberately null while
 * the record is still untouched: mongoose sets `updatedAt` to `createdAt` on
 * insert, and rendering that as "Updated 8 Aug" would tell a consumer their
 * feedback had been looked at when nobody had opened it.
 */
function present(doc) {
  const untouched = doc.updatedAt.getTime() === doc.createdAt.getTime();

  return {
    id: String(doc._id),
    type: doc.type,
    subject: doc.subject,
    message: doc.message,
    status: doc.status,
    submittedAt: doc.createdAt.toISOString(),
    statusChangedAt: untouched ? null : doc.updatedAt.toISOString(),
  };
}

/**
 * File a piece of consumer feedback.
 *
 * The three fields are read individually rather than spread from `req.body`.
 * `{ ...req.body, consumerId }` guarded the owner — the explicit `consumerId`
 * overwrote any the caller sent — but nothing else: a client could post
 * `status: 'resolved'` and the record was created already closed. TWD triages on
 * `status: 'open'`, so that feedback would never appear in the queue. A consumer
 * reporting a billing error would see "Feedback sent", and no one at the district
 * would ever be shown it. Silent disappearance is the exact failure this screen
 * exists to prevent, so `status` stays the schema's default and is only movable by
 * whatever staff-side tooling owns triage.
 */
exports.create = async (req, res) => {
  const { type, subject, message } = req.body;

  const feedback = await Feedback.create({
    // The registry consumer, not the auth id. A Google session's sub points at
    // google_users, and filing feedback under that id would detach it from the
    // household the office needs to answer.
    consumerId: req.consumerScope?.consumerIds?.[0] ?? req.user.sub,
    type,
    subject,
    message,
  });

  res.status(201).json({ feedback: present(feedback) });
};

/**
 * This consumer's own feedback, newest first.
 *
 * Scoped to `req.user.sub` inside the model helper, with no caller-supplied
 * parameter to tamper with — the same rule the billing endpoint was rewritten to
 * follow. There is no "get one by id" sibling on purpose: the list already carries
 * every field a detail view would show, so an id-addressable endpoint would add an
 * ownership check to get wrong for no gain.
 */
exports.listMine = async (req, res) => {
  const id = req.consumerScope?.consumerIds?.[0] ?? req.user.sub;
  const feedback = id ? await Feedback.listByConsumer(id) : [];
  res.json({ feedback: feedback.map(present) });
};
