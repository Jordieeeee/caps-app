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
 * outvote the database.
 *
 * BOTH roles are admitted, and that is what makes linking a second account
 * work at all. 'unclaimed' is the first-run claim. 'consumer' is someone who
 * already holds a house and is adding another — the same proof of ownership,
 * against a different account number, producing a second ConsumerLink. It also
 * keeps the original reason 'unclaimed' was on verify: an interrupted claim
 * (code issued, role not yet promoted) can always be completed on a retry.
 *
 * Opening the gate is only safe because claimAccount enforces the two limits
 * that a repeat caller makes reachable — the per-user cap, and the refusal to
 * issue a code for an account somebody already holds. See that controller.
 */
router.post(
  '/claim-account',
  auth,
  requireGoogleRoles('unclaimed', 'consumer'),
  requireFields('accountNumber'),
  asyncHandler(claimAccount)
);
router.post(
  '/verify-claim',
  auth,
  requireGoogleRoles('unclaimed', 'consumer'),
  requireFields('accountNumber', 'code'),
  asyncHandler(verifyClaim)
);

module.exports = router;
