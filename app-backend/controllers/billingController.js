const Billing = require('../models/Billing');
const httpError = require('../utils/httpError');

exports.listByAccount = async (req, res) => {
  const { accountNumber } = req.params;
  if (!accountNumber) throw httpError(400, 'accountNumber is required');
  const bills = await Billing.listByAccount(accountNumber);
  res.json({ bills });
};

exports.create = async (req, res) => {
  const bill = await Billing.create(req.body);
  res.status(201).json({ bill });
};
