const router = require('express').Router();
const { create, listMine } = require('../controllers/feedbackController');
const { auth, requireRole } = require('../middleware/auth');
const { requireFields } = require('../middleware/validate');
const asyncHandler = require('../middleware/asyncHandler');

router.use(auth, requireRole('Consumer'));

router.post('/', requireFields('type', 'subject', 'message'), asyncHandler(create));
router.get('/', asyncHandler(listMine));

module.exports = router;
