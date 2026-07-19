const Account = require('../models/Account');
const httpError = require('../utils/httpError');
const { withPaymentSummary } = require('../utils/accountPaymentSummary');

const MAX_LINKED_ACCOUNTS = 5; // business rule from the consumer app

exports.listMine = async (req, res) => {
  const accounts = await Account.findByConsumer(req.user.sub);
  res.json({ accounts: await Promise.all(accounts.map((a) => withPaymentSummary(a.toObject()))) });
};

exports.link = async (req, res) => {
  const current = await Account.findByConsumer(req.user.sub);
  if (current.length >= MAX_LINKED_ACCOUNTS) {
    throw httpError(409, `Cannot link more than ${MAX_LINKED_ACCOUNTS} accounts`);
  }
  const account = await Account.linkConsumer(req.body.accountNumber, req.user.sub);
  if (!account) throw httpError(404, 'Account not found');
  res.json({ account: await withPaymentSummary(account.toObject()) });
};

exports.unlink = async (req, res) => {
  const account = await Account.unlinkConsumer(req.params.accountNumber, req.user.sub);
  if (!account) throw httpError(404, 'Account not found');
  res.json({ account: await withPaymentSummary(account.toObject()) });
};
