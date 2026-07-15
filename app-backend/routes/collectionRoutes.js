const router = require('express').Router();
const { sync, list } = require('../controllers/collectionController');
const { auth, requireRole } = require('../middleware/auth');
const { requireFields } = require('../middleware/validate');
const asyncHandler = require('../middleware/asyncHandler');

router.use(auth);

router.post(
  '/sync',
  requireRole('Collector', 'Admin'),
  requireFields('clientId', 'accountNumber', 'amount', 'paymentMethod', 'collectionDate'),
  asyncHandler(sync)
);
router.get('/', asyncHandler(list));

module.exports = router;
