const router = require('express').Router();
const {
  listMine,
  listRoute,
  link,
  unlink,
  createLinkRequest,
  listLinkRequests,
  cancelLinkRequest,
} = require('../controllers/accountController');
const { auth, requireRole } = require('../middleware/auth');
const { requireCollectorScope } = require('../middleware/collector-scope');
const { requireConsumerScope } = require('../middleware/consumer-scope');
const { requireFields } = require('../middleware/validate');
const asyncHandler = require('../middleware/asyncHandler');

/**
 * The one Collector route in this file, declared above the Consumer guard below.
 *
 * It carries its own `auth` + collector-scope pair rather than relying on the
 * `router.use` — that guard is what keeps every other endpoint here self-scoped to
 * one consumer, and loosening it to admit collectors would silently open
 * `GET /accounts` (another household's balance) and `DELETE /:accountNumber`
 * (unlinking someone else's meter) to them as well.
 *
 * `requireCollectorScope` replaced `requireRole('Collector')` so an allowlisted
 * Google collector can load their route at all; the exact-string match rejected
 * their lowercase 'collector' claim. This handler reads no collector identity —
 * the route list is the same for everyone — so it takes the scope for the gate
 * alone.
 */
router.get('/route', auth, requireCollectorScope(), asyncHandler(listRoute));

// GET / admits BOTH consumer identities via requireConsumerScope; everything
// after this line stays password-Consumer-only, because link requests and
// unlink write against a consumers._id the Google flow does not have.
router.get('/', auth, requireConsumerScope, asyncHandler(listMine));

// Read-only, both identities. The WRITE side of link requests stays below the
// password-only guard: creating one writes against a consumers._id.
router.get('/link-requests', auth, requireConsumerScope, asyncHandler(listLinkRequests));

router.use(auth, requireRole('Consumer'));

/**
 * Link requests, declared before `/:accountNumber` below.
 *
 * The order matters for the DELETE pair and not for the rest: Express matches
 * `/:accountNumber` against a single path segment, so `/link-requests/<id>` (two
 * segments) could not be captured by it either way — but keeping the specific
 * routes above the parameterised one is the habit that survives someone later
 * widening the pattern.
 */
router.post('/link-requests', requireFields('accountNumber'), asyncHandler(createLinkRequest));
router.delete('/link-requests/:id', asyncHandler(cancelLinkRequest));

/**
 * Both refuse, and both stay mounted. `link` predates the request queue and `unlink`
 * cannot work against a registry this backend may not write; each returns a 403 that
 * explains itself, which is what an older build still on someone's phone needs to
 * hear instead of a 404. See the controller for the reasoning behind each.
 */
router.post('/link', requireFields('accountNumber'), asyncHandler(link));
router.delete('/:accountNumber', asyncHandler(unlink));

module.exports = router;
