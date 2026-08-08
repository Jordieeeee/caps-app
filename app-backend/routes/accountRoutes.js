const router = require('express').Router();
const { listMine, listRoute, link, unlink } = require('../controllers/accountController');
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
router.post('/link', requireFields('accountNumber'), asyncHandler(link));
router.delete('/:accountNumber', asyncHandler(unlink));

module.exports = router;
