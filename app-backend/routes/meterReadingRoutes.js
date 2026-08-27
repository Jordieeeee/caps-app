const router = require('express').Router();
const { sync, list } = require('../controllers/meterReadingController');
const { auth } = require('../middleware/auth');
const { requireCollectorScope } = require('../middleware/collector-scope');
const { requireFields } = require('../middleware/validate');
const asyncHandler = require('../middleware/asyncHandler');

router.use(auth);

router.post(
  '/sync',
  requireCollectorScope({ allowAdmin: true }),
  requireFields('clientId', 'routeId', 'accountNumber', 'previousReading', 'currentReading', 'readingDate'),
  asyncHandler(sync)
);

/**
 * Staff-only, and scoped to one collector inside the controller.
 *
 * The guard here is not decoration: this endpoint sat under the bare
 * `router.use(auth)` above with nothing else, which let a Consumer token list every
 * meter reading in the district. The write beneath it was gated correctly the whole
 * time — the read was simply missed, which is the usual shape of this bug.
 *
 * `requireCollectorScope` replaced `requireRole('Collector', 'Admin')` on both:
 * the exact-string match locked out every Google-allowlisted collector, whose
 * token carries lowercase 'collector'. It gates at least as tightly — the Google
 * branch re-reads the allowlist and the employee record from the database — and
 * additionally resolves the collectors._id the controller scopes by.
 */
router.get('/', requireCollectorScope({ allowAdmin: true }), asyncHandler(list));

module.exports = router;
