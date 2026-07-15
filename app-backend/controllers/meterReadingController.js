const MeterReading = require('../models/MeterReading');
const calculateConsumption = require('../utils/calculateConsumption');

// Idempotent sync endpoint: upserts on the client-generated id so a replayed
// offline queue never creates duplicate readings.
exports.sync = async (req, res) => {
  const consumption = calculateConsumption(req.body.previousReading, req.body.currentReading);
  const reading = await MeterReading.upsertFromClient({
    ...req.body,
    consumption,
    collectorId: req.user.sub, // trust the authenticated collector, not the client
  });
  res.json({ reading });
};

exports.list = async (req, res) => {
  const filter = {};
  if (req.query.accountNumber) filter.accountNumber = req.query.accountNumber;
  if (req.query.routeId) filter.routeId = req.query.routeId;
  const readings = await MeterReading.listByFilter(filter);
  res.json({ readings });
};
