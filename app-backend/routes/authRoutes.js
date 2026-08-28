const router = require('express').Router();
const { register, login, refresh, logout, me } = require('../controllers/authController');
const { googleCallback } = require('../controllers/googleAuthController');
const { setPassword, state } = require('../controllers/credentialController');
const { auth } = require('../middleware/auth');
const { requireFields } = require('../middleware/validate');
const asyncHandler = require('../middleware/asyncHandler');

// `role` is deliberately absent from the register contract — this endpoint only
// ever creates Consumers. See authController.register.
router.post('/register', requireFields('name', 'email', 'password'), asyncHandler(register));
router.post('/login', requireFields('email', 'password'), asyncHandler(login));
router.post('/refresh', requireFields('refreshToken'), asyncHandler(refresh));
router.post('/logout', asyncHandler(logout));
// Google sign-in: the body carries only the opaque id_token. No `role` field is
// accepted — role is decided server-side from verified claims + the allowlist.
router.post('/google/callback', requireFields('idToken'), asyncHandler(googleCallback));
router.get('/me', auth, asyncHandler(me));

/**
 * Set the email/password credential on a Google identity — either role.
 *
 * Here rather than under /profile because the credential belongs to the identity,
 * not to a consumer's registry record or a collector's employment record. Both
 * roles call this one endpoint; see controllers/credentialController.js.
 *
 * PUT, not POST: setting a password and replacing it are the same request, and the
 * result does not depend on how many times it is sent.
 */
router.put('/password', auth, requireFields('password'), asyncHandler(setPassword));

/**
 * The credential state alone — what the Password screen needs and nothing else.
 *
 * Separate from the profile endpoints on purpose: those answer "who is this person
 * to the district", which for a collector costs the registry and a count over every
 * reading they have ever filed. See controllers/credentialController.js `state`.
 */
router.get('/password', auth, asyncHandler(state));

module.exports = router;
