const Billing = require('../models/Billing');

/**
 * What the caller owes, attributed to their account — derived from `bills` on read,
 * never stored on Account, so paying a bill can't leave a stale balance behind.
 *
 * ⚠️ Schema mismatch, deliberately surfaced rather than papered over.
 *
 * The consumer UI shows a balance per water account. The portal's real bills carry
 * `consumer` and no account reference at all, so "what does ACC-2026-0004 owe" has
 * no answer in the data whenever one consumer holds more than one account — their
 * bills cannot be split back out per meter.
 *
 * ⚠️ THE AMBIGUITY IS ABOUT THE CALLER'S BILLS, NOT ABOUT THE METER. This used to
 * take an Account and bail when `account.consumerIds.length !== 1`, which asked the
 * wrong question twice over: `consumerIds` is a dangling seed-script field that
 * matches nothing in the district's database (see models/Account.js), and a *shared*
 * meter does not actually make the balance unattributable. If a consumer holds
 * exactly one account, every bill addressed to them is a bill for that account —
 * whoever else happens to be on the same meter has their own bills, and those were
 * never in this consumer's set to begin with.
 *
 * So the question is simply: does the caller hold one account, or several? One is
 * derivable and we report it. Several returns `outstanding: null`, because the
 * plausible alternatives are all wrong in ways that matter: attributing the full
 * balance to each account double-counts what the household owes, and splitting it
 * evenly invents a division the district never made. A consumer who reads either
 * one and pays it is going to the counter with the wrong amount.
 *
 * The real fix is an account reference on the bill, which belongs to the portal's
 * billing run. Until then callers must render null as "See total balance" rather
 * than as ₱0.00 — zero is a specific and dangerous claim here.
 *
 * @param {string} consumerId  The caller — `req.user.sub`, never a request parameter.
 * @param {number} accountCount  How many accounts the caller holds.
 * @returns {Promise<{ outstanding: number|null, paymentStatus: 'Active'|'Past Due'|'Unknown' }>}
 */
async function attributableBalance(consumerId, accountCount) {
  if (accountCount !== 1) {
    return { outstanding: null, paymentStatus: 'Unknown' };
  }

  const bills = await Billing.listForConsumer(consumerId);
  const unpaid = bills.filter((b) => b.status !== 'paid');

  return {
    outstanding: unpaid.reduce((sum, b) => sum + b.amount, 0),
    paymentStatus: unpaid.some((b) => b.status === 'overdue') ? 'Past Due' : 'Active',
  };
}

module.exports = { attributableBalance };
