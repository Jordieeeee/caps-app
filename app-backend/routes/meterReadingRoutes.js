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
router.get('/', asyncHandler(list));

module.exports = router;
