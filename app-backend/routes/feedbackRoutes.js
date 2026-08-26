const router = require('express').Router();
const { create, listMine } = require('../controllers/feedbackController');
const { auth } = require('../middleware/auth');
const { requireConsumerScope } = require('../middleware/consumer-scope');
const { requireFields } = require('../middleware/validate');
const asyncHandler = require('../middleware/asyncHandler');

router.use(auth, requireConsumerScope);

router.post('/', requireFields('type', 'subject', 'message'), asyncHandler(create));
router.get('/', asyncHandler(listMine));

module.exports = router;
