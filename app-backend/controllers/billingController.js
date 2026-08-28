const Billing = require('../models/Billing');
const ServiceConnection = require('../models/ServiceConnection');
const { amountOf, isPaid, consumptionOf } = require('../models/Billing');
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
 * `status` is recomputed rather than trusted: the portal marks a bill OVERDUE
 * during its own billing run, so a bill that passed its due date since that run
 * still reads UNPAID in the document. The consumer would see "due" on something
 * the office already considers late.
 *
 * `unpaid` maps to `pending` because that is the vocabulary the client types use.
 *
 * The reading figures ride along on the bill itself — `consumptionCuM` is what the
 * district charged for, not a number this backend derives from `meterreadings`.
 * That distinction is the whole point: a collector's raw reading can be pending
 * approval, rejected, or re-read, and the one a consumer is entitled to see on a
 * bill is the one the bill was computed from. They arrive as explicit nulls when a
 * bill carries no reading (a legacy import, a minimum-charge bill), so the client
 * can say "not recorded" instead of rendering 0 m³ — which reads as "you used no
 * water" on a bill that charged for some.
 *
 * `accountNumber` is resolved from the bill's `connectionId`, and it stopped
 * being optional the moment a consumer could hold two houses. A list mixing two
 * properties' bills with nothing naming either is not a cosmetic problem: it is
 * how somebody pays one house believing they have cleared both.
 *
 * Null where a bill carries no `connectionId` — legacy imports predate the
 * field. Null is the honest answer there and the client says "Account not
 * recorded"; inventing an attribution would put a real bill under the wrong
 * roof, which is the exact failure this field exists to prevent.
 */
function present(bill, now, accountByConnection) {
  const paid = isPaid(bill);
  const overdueDays = paid ? 0 : daysOverdue(bill.dueDate, now);
  const status = paid ? 'paid' : overdueDays > 0 ? 'overdue' : 'pending';
  const { consumptionCuM, previousReading, currentReading } = consumptionOf(bill);

  return {
    id: String(bill._id),
    accountNumber: bill.connectionId
      ? (accountByConnection.get(String(bill.connectionId)) ?? null)
      : null,
    billingPeriod: bill.period,
    amount: amountOf(bill),
    dueDate: bill.dueDate.toISOString(),
    status,
    daysOverdue: overdueDays,
    paymentDate: bill.paymentDate ? bill.paymentDate.toISOString() : undefined,
    paymentMethod: bill.paymentMethod,
    consumptionCuM,
    previousReading,
    currentReading,
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
  // Scope comes from requireConsumerScope, never from req.user.sub directly:
  // that id is a consumers._id for a password session and a google_users._id
  // for a Google one, and only the middleware knows how to turn either into
  // the set of registry consumers this caller may read.
  const bills = await Billing.listForConsumers(req.consumerScope.consumerIds);

  // One extra query for the whole page rather than one per bill. Only the
  // connections these bills actually reference are fetched, and a caller with a
  // single house pays for a lookup over a single id.
  const connectionIds = [
    ...new Set(bills.map((b) => b.connectionId).filter(Boolean).map(String)),
  ];
  const connections = connectionIds.length
    ? await ServiceConnection.find({ _id: { $in: connectionIds } })
        .select('accountNo')
        .lean()
    : [];
  const accountByConnection = new Map(
    connections.map((c) => [String(c._id), c.accountNo || null])
  );

  res.json({ bills: bills.map((b) => present(b, now, accountByConnection)) });
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
