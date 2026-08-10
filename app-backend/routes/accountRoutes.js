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
const { requireFields } = require('../middleware/validate');
const asyncHandler = require('../middleware/asyncHandler');

/**
 * The one Collector route in this file, declared above the Consumer guard below.
 *
 * It carries its own `auth` + `requireRole` pair rather than relying on the
 * `router.use` — that guard is what keeps every other endpoint here self-scoped to
 * one consumer, and loosening it to admit collectors would silently open
 * `GET /accounts` (another household's balance) and `DELETE /:accountNumber`
 * (unlinking someone else's meter) to them as well.
 */
router.get('/route', auth, requireRole('Collector'), asyncHandler(listRoute));

router.use(auth, requireRole('Consumer'));

router.get('/', asyncHandler(listMine));

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
router.get('/link-requests', asyncHandler(listLinkRequests));
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
