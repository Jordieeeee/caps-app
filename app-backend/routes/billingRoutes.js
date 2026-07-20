const router = require('express').Router();
const { listMine, create } = require('../controllers/billingController');
const { auth, requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');

router.use(auth);

/**
 * Consumer-scoped by construction.
 *
 * This replaces `GET /:accountNumber`, which took the account from the URL behind
 * bare `auth` and never checked that the caller owned it — an IDOR over sequential,
 * publicly-printed account numbers. There is deliberately no parameter here to
 * tamper with: the identity comes from the token.
 */
router.get('/', requireRole('Consumer'), asyncHandler(listMine));

/** Retained so the old write path fails loudly (410) rather than 404-ing silently. */
router.post('/', requireRole('Admin'), asyncHandler(create));

module.exports = router;
