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
  // See billingController: the caller's registry ids come from the scope
  // middleware. A Google consumer has no notifications of their own yet, but
  // the ones attached to their linked registry consumer are legitimately
  // theirs to read.
  const ids = req.consumerScope.consumerIds;
  const notifications = ids.length
    ? await Notification.find({ consumerId: { $in: ids } }).sort({ createdAt: -1 })
    : [];
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
  // Ownership stays part of the query (see the note above), but the owning id
  // is the REGISTRY consumer from the scope — req.user.sub is a google_users
  // id for a Google session and would match nothing, so marking read would
  // fail silently with a 404 on a notification the caller can plainly see.
  const ids = req.consumerScope?.consumerIds ?? [req.user.sub];
  let notification = null;
  for (const id of ids) {
    notification = await Notification.markRead(req.params.id, id);
    if (notification) break;
  }
  if (!notification) throw httpError(404, 'Notification not found');
  res.json({ notification: present(notification) });
};
