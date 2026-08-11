const router = require('express').Router();
const { sync, list } = require('../controllers/serviceOrderController');
const { auth, requireRole } = require('../middleware/auth');
const { requireFields } = require('../middleware/validate');
const asyncHandler = require('../middleware/asyncHandler');

router.use(auth);

router.post(
  '/sync',
  requireRole('Collector', 'Admin'),
  requireFields('clientId', 'type', 'accountNumber'),
  asyncHandler(sync)
);

/**
 * Staff-only. Deliberately NOT scoped to one collector, unlike GET /readings.
 *
 * Orders are unassigned work: the app's Reconnections and Disconnections lists show
 * every open order so whoever is nearest can take one, and there is no `collectorId`
 * on the document to narrow by. The controller joins each order to `consumers` and
 * `serviceconnections` to name the household, so this response carries names and
 * addresses — which is exactly why it must not stay open to a Consumer token, as it
 * was until now.
 */
router.get('/', requireRole('Collector', 'Admin'), asyncHandler(list));

module.exports = router;
