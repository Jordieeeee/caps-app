const router = require('express').Router();
const { listMine, link, unlink } = require('../controllers/accountController');
const { auth, requireRole } = require('../middleware/auth');
const { requireFields } = require('../middleware/validate');
const asyncHandler = require('../middleware/asyncHandler');

router.use(auth, requireRole('Consumer'));

router.get('/', asyncHandler(listMine));
router.post('/link', requireFields('accountNumber'), asyncHandler(link));
router.delete('/:accountNumber', asyncHandler(unlink));

module.exports = router;
