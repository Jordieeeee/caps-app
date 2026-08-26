const router = require('express').Router();
const {
  listAllowlist,
  addToAllowlist,
  removeFromAllowlist,
  unlinkConsumerLink,
} = require('../controllers/adminController');
const { auth } = require('../middleware/auth');
const { requireDbAdmin } = require('../middleware/admin');
const { requireFields } = require('../middleware/validate');
const asyncHandler = require('../middleware/asyncHandler');

// Every route below is portal-admin only (DB-verified via requireDbAdmin).
router.use(auth, requireDbAdmin);

// Email travels in the path URL-encoded; dots and plus signs are safe that
// way and the audit log reads naturally ("DELETE …allowlist/juan%40x.ph").
router.get('/collector-allowlist', asyncHandler(listAllowlist));
router.post('/collector-allowlist', requireFields('email'), asyncHandler(addToAllowlist));
router.delete('/collector-allowlist/:email', asyncHandler(removeFromAllowlist));

// Action-style POST rather than DELETE /consumer-links/:id — see the
// controller comment for why this shape fits a dispute act with a required
// audit payload addressed by EITHER accountNumber or userId.
router.post('/consumer-links/unlink', asyncHandler(unlinkConsumerLink));

module.exports = router;
