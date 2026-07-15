const router = require('express').Router();
const { listByAccount, create } = require('../controllers/billingController');
const { auth, requireRole } = require('../middleware/auth');
const { requireFields } = require('../middleware/validate');
const asyncHandler = require('../middleware/asyncHandler');

router.use(auth);

router.get('/:accountNumber', asyncHandler(listByAccount));
router.post(
  '/',
  requireRole('Admin'),
  requireFields('accountNumber', 'billingPeriod', 'amount', 'dueDate'),
  asyncHandler(create)
);

module.exports = router;
