const router = require('express').Router();
const { get, update } = require('../controllers/profileController');
const {
  get: getCollector,
  update: updateCollector,
} = require('../controllers/collectorProfileController');
const { auth, requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');

/**
 * Self-scoped throughout, for both roles.
 *
 * There is no `/:id` variant and no way to name another person: every handler
 * resolves its record from `req.user.sub` alone. That is the same rule the billing
 * endpoint had to be rewritten to follow after `GET /billing/:accountNumber` let
 * any logged-in consumer read any household's record off a guessable number.
 *
 * The collector routes are declared first, with their own guard, and the Consumer
 * `router.use` below still covers everything after them — a collector reaching
 * `GET /profile` gets a 403, not a consumer's registry record.
 */
const collectorOnly = [auth, requireRole('Collector')];
router.get('/collector', ...collectorOnly, asyncHandler(getCollector));
router.patch('/collector', ...collectorOnly, asyncHandler(updateCollector));

router.use(auth, requireRole('Consumer'));

router.get('/', asyncHandler(get));
router.patch('/', asyncHandler(update));

module.exports = router;
