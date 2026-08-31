const Billing = require('../models/Billing');
const { isPaid } = require('../models/Billing');

/**
 * Is this household's account clear, and how far behind are they?
 *
 * The two service-order requirements name an eligibility condition each — a
 * reconnection is "for consumers with settled accounts", a disconnection is "for
 * delinquent accounts" — and neither was answerable anywhere in the app. The order
 * was the only authority, so a collector at a gate could not tell whether the office
 * had raised it against an account that actually qualified.
 *
 * Keyed on the bill's `connectionId`, which is the meter the order is about. That is
 * a deliberate difference from utils/accountPaymentSummary.js, which resolves the
 * peso balance per CONSUMER and returns null where one person holds several meters
 * — its own note explains why, and that figure stays the one shown, so the collector
 * and the household are quoted the same amount. Counts and dates carry no such
 * ambiguity: "three unpaid bills on this meter" is true whether or not the total can
 * be split, so those are answered here even when the balance cannot be.
 *
 * ⚠️ `settled` IS THREE-STATE, AND THE THIRD STATE IS THE POINT. `null` means the
 * connection has no bills at all — which is NOT the same as being paid up. Twenty of
 * the district's twenty-eight connections are in exactly that position. Collapsing
 * them into `true` would tell a collector an account was cleared when nothing was
 * ever billed against it, which is the difference between restoring service to
 * someone who paid and restoring it to someone the district has never invoiced.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @param {Array<{_id: any}>} connections lean `serviceconnections` documents
 * @returns {Promise<Map<string, {
 *   settled: boolean|null, billCount: number, unpaidBillCount: number, daysPastDue: number
 * }>>} keyed by String(connection._id)
 */
async function eligibilityByConnection(connections) {
  const blank = () => ({ settled: null, billCount: 0, unpaidBillCount: 0, daysPastDue: 0 });
  const byConnection = new Map(connections.map((c) => [String(c._id), blank()]));
  if (connections.length === 0) return byConnection;

  const bills = await Billing.find({
    connectionId: { $in: connections.map((c) => c._id) },
    // Voided bills are not debts. They are the portal's record of a bill it
    // withdrew, and counting one would make a cleared account look delinquent.
    isVoid: { $ne: true },
  })
    .select('connectionId status dueDate')
    .lean();

  const now = Date.now();

  for (const bill of bills) {
    const row = byConnection.get(String(bill.connectionId));
    if (!row) continue;

    row.billCount += 1;
    if (isPaid(bill)) continue;

    row.unpaidBillCount += 1;
    if (!bill.dueDate) continue;

    // Whole days only, and never negative: a bill due next week is not "-6 days
    // overdue", it is simply not overdue, and the screens read 0 as "not past due".
    const days = Math.floor((now - new Date(bill.dueDate).getTime()) / DAY_MS);
    if (days > row.daysPastDue) row.daysPastDue = days;
  }

  for (const row of byConnection.values()) {
    row.settled = row.billCount === 0 ? null : row.unpaidBillCount === 0;
  }

  return byConnection;
}

module.exports = { eligibilityByConnection };
