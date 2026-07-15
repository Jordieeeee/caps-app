const router = require('express').Router();
const { register, login, refresh, logout, me } = require('../controllers/authController');
const { auth } = require('../middleware/auth');
const { requireFields } = require('../middleware/validate');
const asyncHandler = require('../middleware/asyncHandler');

// `role` is deliberately absent from the register contract — this endpoint only
// ever creates Consumers. See authController.register.
router.post('/register', requireFields('name', 'email', 'password'), asyncHandler(register));
router.post('/login', requireFields('email', 'password'), asyncHandler(login));
router.post('/refresh', requireFields('refreshToken'), asyncHandler(refresh));
router.post('/logout', asyncHandler(logout));
router.get('/me', auth, asyncHandler(me));

module.exports = router;
