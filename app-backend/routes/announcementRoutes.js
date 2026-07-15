const router = require('express').Router();
const { list, create } = require('../controllers/announcementController');
const { auth, requireRole } = require('../middleware/auth');
const { requireFields } = require('../middleware/validate');
const asyncHandler = require('../middleware/asyncHandler');

router.use(auth);

router.get('/', asyncHandler(list));
router.post(
  '/',
  requireRole('Admin'),
  requireFields('title', 'type', 'content'),
  asyncHandler(create)
);

module.exports = router;
