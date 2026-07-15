const Announcement = require('../models/Announcement');

exports.list = async (req, res) => {
  const filter = {};
  if (req.query.type) filter.type = req.query.type;
  if (req.query.zone) filter.zone = req.query.zone;
  const announcements = await Announcement.listByFilter(filter);
  res.json({ announcements });
};

exports.create = async (req, res) => {
  const announcement = await Announcement.create(req.body);
  res.status(201).json({ announcement });
};
