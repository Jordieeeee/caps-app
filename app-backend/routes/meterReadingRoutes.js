const router = require('express').Router();
const { sync, list } = require('../controllers/meterReadingController');
const { auth, requireRole } = require('../middleware/auth');
const { requireFields } = require('../middleware/validate');
const asyncHandler = require('../middleware/asyncHandler');

router.use(auth);

router.post(
  '/sync',
  requireRole('Collector', 'Admin'),
  requireFields('clientId', 'routeId', 'accountNumber', 'previousReading', 'currentReading', 'readingDate'),
  asyncHandler(sync)
);

/**
 * Staff-only, and scoped to one collector inside the controller.
 *
 * The `requireRole` here is not decoration: this endpoint sat under the bare
 * `router.use(auth)` above with nothing else, which let a Consumer token list every
 * meter reading in the district. The write beneath it was gated correctly the whole
 * time — the read was simply missed, which is the usual shape of this bug.
 */
router.get('/', requireRole('Collector', 'Admin'), asyncHandler(list));

module.exports = router;
