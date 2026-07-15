const router = require('express').Router();
const { listMine, markRead } = require('../controllers/notificationController');
const { auth, requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');

router.use(auth, requireRole('Consumer'));

router.get('/', asyncHandler(listMine));
router.patch('/:id/read', asyncHandler(markRead));

module.exports = router;
