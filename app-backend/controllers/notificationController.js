const Notification = require('../models/Notification');
const httpError = require('../utils/httpError');

/**
 * The client's shape, not Mongo's.
 *
 * Same rule as `presentRequest` in accountController: `_id` becomes `id`, dates
 * become ISO strings, and absent optional fields become explicit nulls rather than
 * disappearing from the payload — a screen branching on `amount === null` is
 * clearer than one branching on `'amount' in notification`.
 *
 * `consumerId` is deliberately not echoed. The caller is the consumer; telling them
 * their own id back is noise, and a presenter that never emits it cannot leak one
 * belonging to somebody else if this collection later grows a broadcast row.
 */
function present(doc) {
  return {
    id: String(doc._id),
    kind: doc.kind,
    message: doc.message,
    accountNumber: doc.accountNumber || null,
    amount: typeof doc.amount === 'number' ? doc.amount : null,
    dueDate: doc.dueDate || null,
    read: Boolean(doc.read),
    createdAt: doc.createdAt.toISOString(),
  };
}

/**
 * GET /notifications — this consumer's own messages, newest first.
 *
 * ⚠️ EXPECT AN EMPTY ARRAY TODAY, and do not treat that as a bug to fix by widening
 * the query. `consumernotifications` has no writer yet — see models/Notification.js
 * for what happened the last time this endpoint read a collection it did not own.
 */
exports.listMine = async (req, res) => {
  const notifications = await Notification.listByConsumer(req.user.sub);
  res.json({ notifications: notifications.map(present) });
};

/**
 * PATCH /notifications/:id/read
 *
 * Ownership is part of the query rather than a check after the read — the same
 * construction `cancelLinkRequest` uses, and for the same reason: a `findById`
 * followed by an `if` is one early return away from letting a consumer mark a
 * stranger's notification read. There is no version of this query that matches a
 * row belonging to someone else, so a wrong id and a foreign id are one case.
 */
exports.markRead = async (req, res) => {
  const notification = await Notification.markRead(req.params.id, req.user.sub);
  if (!notification) throw httpError(404, 'Notification not found');
  res.json({ notification: present(notification) });
};
