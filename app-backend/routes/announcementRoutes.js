const router = require('express').Router();
const { list, stream, create } = require('../controllers/announcementController');
const { auth, requireRole } = require('../middleware/auth');
const { requireFields } = require('../middleware/validate');
const asyncHandler = require('../middleware/asyncHandler');

router.use(auth);

router.get('/', asyncHandler(list));

/**
 * Live notices, as Server-Sent Events. Same audience gate as the list above.
 *
 * Deliberately NOT wrapped in asyncHandler: the handler holds the response open
 * for the life of the connection and never resolves, so there is no promise for
 * the wrapper to forward and no error the central handler could still send.
 */
router.get('/stream', stream);
router.post(
  '/',
  requireRole('Admin'),
  requireFields('title', 'type', 'content'),
  asyncHandler(create)
);

module.exports = router;
