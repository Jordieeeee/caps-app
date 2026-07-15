const ServiceOrder = require('../models/ServiceOrder');

// Idempotent sync endpoint keyed on the client-generated id.
exports.sync = async (req, res) => {
  const order = await ServiceOrder.upsertFromClient(req.body);
  res.json({ order });
};

exports.list = async (req, res) => {
  const filter = {};
  if (req.query.accountNumber) filter.accountNumber = req.query.accountNumber;
  if (req.query.type) filter.type = req.query.type;
  if (req.query.status) filter.status = req.query.status;
  const orders = await ServiceOrder.listByFilter(filter);
  res.json({ orders });
};
