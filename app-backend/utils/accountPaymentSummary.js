const Billing = require('../models/Billing');

/**
 * outstanding/paymentStatus for an Account, derived from its Billing records —
 * never stored on Account itself, so there is one source of truth and paying a
 * bill can't leave a stale balance behind.
 *
 * `paymentStatus` is only ever 'Active' or 'Past Due': Billing.status
 * distinguishes paid/pending/overdue and nothing else, so a third state like
 * 'Delinquent' (e.g. "overdue by more than N days") is not derivable without a
 * business rule that doesn't exist yet — invent one only if TWD actually
 * specifies it.
 *
 * @param {string} accountNumber
 * @returns {Promise<{ outstanding: number, paymentStatus: 'Active' | 'Past Due' }>}
 */
async function accountPaymentSummary(accountNumber) {
  const bills = await Billing.listByAccount(accountNumber);
  const unpaid = bills.filter((b) => b.status !== 'paid');

  const outstanding = unpaid.reduce((sum, b) => sum + b.amount, 0);
  const paymentStatus = unpaid.some((b) => b.status === 'overdue') ? 'Past Due' : 'Active';

  return { outstanding, paymentStatus };
}

/** Attach { outstanding, paymentStatus } to a plain Account object (already .toObject()'d). */
async function withPaymentSummary(account) {
  const summary = await accountPaymentSummary(account.accountNumber);
  return { ...account, ...summary };
}

module.exports = { accountPaymentSummary, withPaymentSummary };
