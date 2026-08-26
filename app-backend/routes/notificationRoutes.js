const router = require('express').Router();
const { listMine, markRead } = require('../controllers/notificationController');
const { auth } = require('../middleware/auth');
const { requireConsumerScope } = require('../middleware/consumer-scope');
const asyncHandler = require('../middleware/asyncHandler');

router.use(auth, requireConsumerScope);

router.get('/', asyncHandler(listMine));
router.patch('/:id/read', asyncHandler(markRead));

module.exports = router;
