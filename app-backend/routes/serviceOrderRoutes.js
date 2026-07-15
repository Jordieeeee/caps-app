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
router.get('/', asyncHandler(list));

module.exports = router;
