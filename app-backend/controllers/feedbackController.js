const Feedback = require('../models/Feedback');

exports.create = async (req, res) => {
  const feedback = await Feedback.create({ ...req.body, consumerId: req.user.sub });
  res.status(201).json({ feedback });
};

exports.listMine = async (req, res) => {
  const feedback = await Feedback.listByConsumer(req.user.sub);
  res.json({ feedback });
};
