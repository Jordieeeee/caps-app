const router = require('express').Router();
const { claimAccount, verifyClaim } = require('../controllers/consumerClaimController');
const { auth } = require('../middleware/auth');
const { requireGoogleRoles } = require('../middleware/google-access');
const { requireFields } = require('../middleware/validate');
const asyncHandler = require('../middleware/asyncHandler');

/**
 * Consumer claim/verify — the only path to a ConsumerLink, and therefore the
 * only path to billing data for Google-flow identities.
 *
 * Role gates are DB-derived (requireGoogleRoles re-reads the user row), never
 * taken from the JWT claim: a token minted before a claim/unlink must not
 * outvote the database. Both endpoints are 'unclaimed' by spec; verify stays
 * 'unclaimed' so an interrupted claim (code issued, role not yet promoted)
 * can always be completed on a second attempt.
 */
router.post(
  '/claim-account',
  auth,
  requireGoogleRoles('unclaimed'),
  requireFields('accountNumber'),
  asyncHandler(claimAccount)
);
router.post(
  '/verify-claim',
  auth,
  requireGoogleRoles('unclaimed'),
  requireFields('accountNumber', 'code'),
  asyncHandler(verifyClaim)
);

module.exports = router;
