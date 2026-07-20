const Billing = require('../models/Billing');
const httpError = require('../utils/httpError');
const ErrorCodes = require('../utils/errorCodes');

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Days a bill is past due, computed here and only here.
 *
 * The client must never derive this. A device clock is user-settable and drifts;
 * the mock UI computed "369 days overdue" against hardcoded 2025 dates on a 2026
 * phone. Overdue drives the disconnection warning, so the number a consumer reads
 * has to be the number the district would read.
 *
 * Uses UTC midnight on both sides so a bill does not flip to "1 day overdue" at
 * 00:00 in one timezone and stay current in another.
 */
function daysOverdue(dueDate, now) {
  const due = Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate());
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.max(0, Math.floor((today - due) / DAY_MS));
}

/**
 * Shape a portal bill for the mobile UI.
 *
 * `status` is recomputed rather than trusted: the portal marks a bill 'overdue'
 * during its own billing run, so a bill that passed its due date since that run
 * still reads 'unpaid' in the document. The consumer would see "due" on something
 * the office already considers late.
 *
 * `unpaid` maps to `pending` because that is the vocabulary the client types use.
 *
 * ⚠️ No `accountNumber`. Real bills carry no account reference — see
 * utils/accountPaymentSummary. Inventing one here is exactly the "fill the hole
 * with plausible data" failure; the client groups by consumer until the portal's
 * billing run puts a real account ref on the bill.
 */
function present(bill, now) {
  const overdueDays = bill.status === 'paid' ? 0 : daysOverdue(bill.dueDate, now);
  const status = bill.status === 'paid' ? 'paid' : overdueDays > 0 ? 'overdue' : 'pending';

  return {
    id: String(bill._id),
    billingPeriod: bill.billingPeriod,
    amount: bill.amount,
    dueDate: bill.dueDate.toISOString(),
    status,
    daysOverdue: overdueDays,
    paymentDate: bill.paymentDate ? bill.paymentDate.toISOString() : undefined,
    paymentMethod: bill.paymentMethod,
  };
}

/**
 * The caller's own bills.
 *
 * Scoped to `req.user.sub` and nothing else — there is no accountNumber parameter
 * to tamper with. The previous route was `GET /billing/:accountNumber` behind bare
 * `auth`, which proved only that the caller was logged in: any consumer could read
 * any household's full billing history by walking ACC-2026-0001 upward. Account
 * numbers are printed on every bill and sequential, so that was a one-line script.
 */
exports.listMine = async (req, res) => {
  const now = new Date();
  const bills = await Billing.listForConsumer(req.user.sub);
  res.json({ bills: bills.map((b) => present(b, now)) });
};

/**
 * Bill creation lives in the Admin Portal, which owns arrears carry-forward,
 * voiding, and the penalty run. This backend reads `bills` and never writes it.
 */
exports.create = async (req, res) => {
  throw httpError(
    410,
    'Bills are issued by the TWD Admin Portal. This endpoint no longer accepts writes.',
    ErrorCodes.NOT_SUPPORTED
  );
};
