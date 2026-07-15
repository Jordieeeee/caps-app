const Collection = require('../models/Collection');

// Idempotent sync endpoint keyed on the client-generated id.
exports.sync = async (req, res) => {
  const collection = await Collection.upsertFromClient({
    ...req.body,
    collectorId: req.user.sub,
  });
  res.json({ collection });
};

exports.list = async (req, res) => {
  const filter = {};
  if (req.query.accountNumber) filter.accountNumber = req.query.accountNumber;
  if (req.query.collectorId) filter.collectorId = req.query.collectorId;
  const collections = await Collection.listByFilter(filter);
  res.json({ collections });
};
