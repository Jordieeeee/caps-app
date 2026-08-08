const router = require('express').Router();
const { get, update } = require('../controllers/profileController');
const { auth, requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');

/**
 * Consumer-only, and self-scoped throughout.
 *
 * There is no `/:id` variant and no way to name another consumer: both handlers
 * resolve the record from `req.user.sub` alone. That is the same rule the billing
 * endpoint had to be rewritten to follow after `GET /billing/:accountNumber` let
 * any logged-in consumer read any household's record off a guessable number.
 */
router.use(auth, requireRole('Consumer'));

router.get('/', asyncHandler(get));
router.patch('/', asyncHandler(update));

module.exports = router;
