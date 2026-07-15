const Notification = require('../models/Notification');
const httpError = require('../utils/httpError');

exports.listMine = async (req, res) => {
  const notifications = await Notification.listByConsumer(req.user.sub);
  res.json({ notifications });
};

exports.markRead = async (req, res) => {
  const notification = await Notification.markRead(req.params.id, req.user.sub);
  if (!notification) throw httpError(404, 'Notification not found');
  res.json({ notification });
};
