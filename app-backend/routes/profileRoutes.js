const router = require('express').Router();
const { get, update } = require('../controllers/profileController');
const {
  get: getCollector,
  update: updateCollector,
} = require('../controllers/collectorProfileController');
const { auth, requireRole } = require('../middleware/auth');
const { requireConsumerScope } = require('../middleware/consumer-scope');
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

// Both consumer identities may read AND edit their own registry record.
//
// PATCH was briefly password-only, on the reasoning that a Google identity
// editing the contact number could redirect the claim OTP — the check that
// proved they owned the account. That guard was dropped deliberately: the
// PASSWORD consumer has always been able to edit the same field on the same
// document, so the restriction protected nothing while making the Google path
// visibly worse ("Insufficient permissions" on the consumer's own details).
//
// The residual risk is real but narrow, and worth stating: whoever holds the
// active ConsumerLink can change the number a FUTURE re-claim would be sent
// to. It grants them no access they do not already have — the link itself is
// the access — but after an admin unlink, the number on file may no longer be
// the household's. If that becomes a dispute, the fix is to re-verify by OTP
// before a contact-number change commits, not to re-block the whole endpoint.
router.get('/', auth, requireConsumerScope, asyncHandler(get));
router.patch('/', auth, requireConsumerScope, asyncHandler(update));

router.use(auth, requireRole('Consumer'));

module.exports = router;
