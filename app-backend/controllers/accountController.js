const Account = require('../models/Account');
const httpError = require('../utils/httpError');
const ErrorCodes = require('../utils/errorCodes');
const { withPaymentSummary } = require('../utils/accountPaymentSummary');

exports.listMine = async (req, res) => {
  const accounts = await Account.findByConsumer(req.user.sub);
  res.json({ accounts: await Promise.all(accounts.map((a) => withPaymentSummary(a.toObject()))) });
};

/**
 * Self-service linking is CLOSED, deliberately.
 *
 * What this used to do: take `accountNumber` from the request body and
 * `$addToSet` the caller onto that account, capped only at five. No check that the
 * caller had any relationship to the meter. Account numbers are sequential
 * (ACC-2026-0001 upward) and printed on every bill posted through a door, so any
 * consumer could link a stranger's account and immediately read their name,
 * address, and outstanding balance through GET /accounts. That is a full
 * enumeration of the district's customer base from one ordinary login.
 *
 * It fails closed rather than shipping a guess at verification, because every
 * cheap check is one the attacker also passes — the last bill amount, the address,
 * the meter number are all printed on the bill or visible from the street. A real
 * check needs something only the account holder has, and choosing it is the
 * district's call, not this file's.
 *
 * ⚠️ PRODUCT DECISION REQUIRED. This is consistent with the decided model in the
 * meantime: consumer logins are already created by TWD office staff with no
 * self-signup, so account linking happening at the same counter is not a new
 * burden. Options for the district:
 *   1. Office-only linking (status quo here) — staff link at the counter on ID.
 *   2. In-app request → office approval queue — consumer submits, staff confirm.
 *   3. Shared-secret challenge — e.g. exact amount of a recent payment, which is
 *      NOT on the bill. Weakest of the three; still guessable for round amounts.
 */
exports.link = async (req, res) => {
  throw httpError(
    403,
    'Water accounts are linked by TWD office staff. Please visit the Tanauan City ' +
      'Water District office with a valid ID to link an account.',
    ErrorCodes.NOT_SUPPORTED
  );
};

/**
 * Unlinking stays open: it only ever removes the caller's own id from an account,
 * so the worst case is a consumer losing sight of their own bill, which they can
 * fix at the office. No one else's data is reachable through it.
 */
exports.unlink = async (req, res) => {
  const account = await Account.unlinkConsumer(req.params.accountNumber, req.user.sub);
  if (!account) throw httpError(404, 'Account not found');
  res.json({ account: await withPaymentSummary(account.toObject()) });
};
