const Billing = require('../models/Billing');

/**
 * outstanding/paymentStatus for an Account, derived from Billing — never stored on
 * Account itself, so there is one source of truth and paying a bill can't leave a
 * stale balance behind.
 *
 * ⚠️ Schema mismatch, deliberately surfaced rather than papered over.
 *
 * The consumer UI shows a balance per linked water account. The portal's real
 * bills carry `consumer` and no account reference at all, so "what does account
 * ACC-2026-0004 owe" has no answer in the data whenever one consumer holds more
 * than one account — their bills cannot be split back out per meter.
 *
 * Today every consumer happens to hold exactly one account, so the 1:1 case is
 * derivable and we report it. The ambiguous case returns `outstanding: null`
 * instead of a number, because the plausible alternatives are all wrong in ways
 * that matter: attributing the full balance to each account double-counts what the
 * household owes, and splitting it evenly invents a division the district never
 * made. A consumer who reads either one and pays it is going to the counter with
 * the wrong amount.
 *
 * The real fix is an account reference on the bill, which belongs to the portal's
 * billing run. Until then callers must render null as "See total balance" rather
 * than as ₱0.00 — zero is a specific and dangerous claim here.
 *
 * @returns {Promise<{ outstanding: number|null, paymentStatus: 'Active'|'Past Due'|'Unknown' }>}
 */
async function accountPaymentSummary(account) {
  const consumerIds = account.consumerIds || [];

  if (consumerIds.length !== 1) {
    return { outstanding: null, paymentStatus: 'Unknown' };
  }

  const bills = await Billing.listForConsumer(consumerIds[0]);
  const unpaid = bills.filter((b) => b.status !== 'paid');

  return {
    outstanding: unpaid.reduce((sum, b) => sum + b.amount, 0),
    paymentStatus: unpaid.some((b) => b.status === 'overdue') ? 'Past Due' : 'Active',
  };
}

/** Attach { outstanding, paymentStatus } to a plain Account object (already .toObject()'d). */
async function withPaymentSummary(account) {
  return { ...account, ...(await accountPaymentSummary(account)) };
}

module.exports = { accountPaymentSummary, withPaymentSummary };
