const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const GoogleUser = require('../models/GoogleUser');
const httpError = require('../utils/httpError');
const { resolveGoogleRole } = require('../utils/googleRole');
const ErrorCodes = require('../utils/errorCodes');

/**
 * POST /auth/google/callback — exchange a Google-issued id_token for a TWD session.
 *
 * The client treats the id_token as opaque and hands it straight over; every
 * claim we act on is read back from the VERIFIED payload here, never from the
 * request body beyond the token itself.
 */

// Verifies Google's RS256 signature against Google's public JWKS plus expiry.
// No client secret involved: this is public verification of tokens Google
// signed, not a Google API call on our own behalf.
//
// `audience` is deliberately NOT passed to verifyIdToken. The mobile app starts
// each browser flow with its platform-specific client ID (iOS or Android), so
// the token's aud claim is that platform ID — rarely the web one. A single
// audience argument would reject every legitimate native login. Signature,
// expiry and issuer are still enforced by the library; aud is enforced below
// against the full allowlist, which is just as strict.
const verifier = new OAuth2Client();

// Every Google-registered client ID that may appear as aud on a valid token.
const ALLOWED_AUDIENCES = [
  process.env.GOOGLE_WEB_CLIENT_ID,
  process.env.GOOGLE_IOS_CLIENT_ID,
  process.env.GOOGLE_ANDROID_CLIENT_ID,
].filter(Boolean);

if (ALLOWED_AUDIENCES.length === 0) {
  console.warn(
    '[auth/google] No GOOGLE_*_CLIENT_ID configured — every sign-in will be rejected.'
  );
}

const VALID_ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);

// Session lifetime for tokens issued here. Seven days: consumers open a billing
// app sporadically and weekly re-auth via Google is low-friction, while a short
// window caps the damage of a leaked token — there is no rotation or revocation
// list behind these yet (the email/password system has both). Env-tunable so
// operations can tighten it without a deploy code change.
const SESSION_TTL = process.env.GOOGLE_SESSION_TTL || '7d';

/** One generic rejection shape for every failure mode below. The client must
 * not be able to distinguish "bad token" from "not allowlisted" from "email
 * unverified" — any of those distinctions is an account-existence oracle. */
function rejectAuth() {
  return httpError(401, 'Sign-in failed. Please try again.', ErrorCodes.INVALID_CREDENTIALS);
}

exports.googleCallback = async (req, res) => {
  const { idToken } = req.body;

  let payload;
  try {
    const ticket = await verifier.verifyIdToken({ idToken });
    payload = ticket.getPayload();
  } catch (err) {
    // Signature invalid, token expired, or malformed. Details stay server-side.
    console.warn('[auth/google] id_token verification failed:', err.message);
    throw rejectAuth();
  }

  if (!payload || !VALID_ISSUERS.has(payload.iss)) {
    console.warn('[auth/google] rejected: unexpected issuer', payload && payload.iss);
    throw rejectAuth();
  }

  if (!ALLOWED_AUDIENCES.includes(payload.aud)) {
    console.warn('[auth/google] rejected: unexpected audience', payload.aud);
    throw rejectAuth();
  }

  // sub/email are read only after all checks above have passed.
  const { sub: googleUid, email } = payload;

  // An allowlist keyed by email must never trust an email Google hasn't itself
  // verified — otherwise a fresh Google account carrying someone else's address
  // would inherit their collector standing.
  if (!googleUid || !email || payload.email_verified !== true) {
    console.warn(
      '[auth/google] rejected: missing claims or unverified email',
      googleUid ? 'sub present' : 'sub missing',
      payload.email_verified
    );
    throw rejectAuth();
  }

  const normalisedEmail = String(email).toLowerCase().trim();

  // Upsert by the immutable googleUid. The email is kept current because Google
  // addresses can change while sub does not; role is NOT touched here — it moves
  // through its own admin path, and this endpoint's only influence over role is
  // the allowlist check below.
  let user = await GoogleUser.findByGoogleUid(googleUid);
  if (!user) {
    try {
      user = await GoogleUser.create({ googleUid, email: normalisedEmail });
    } catch (err) {
      // Two first sign-ins racing each other: the unique index lets exactly one
      // create win, the loser re-reads the winner's document.
      if (err.code !== 11000) throw err;
      user = await GoogleUser.findByGoogleUid(googleUid);
      if (!user) throw err;
    }
  } else if (user.email !== normalisedEmail) {
    try {
      user.email = normalisedEmail;
      await user.save();
    } catch (err) {
      // New email already belongs to another identity — treat as a failed
      // sign-in rather than silently merging two accounts.
      console.warn('[auth/google] email update conflict:', err.message);
      throw rejectAuth();
    }
  }

  // Allowlist membership grants collector standing on THIS SESSION only; the
  // stored users.role is left alone. Session-scoped means removing an email
  // from the allowlist demotes them on their next sign-in with no migration —
  // revocation stays instant.
  //
  // Shared with the password door into the same identity (authController's
  // `authenticateMobileCredential`), because the two must decide this the same
  // way or the newer one becomes a way around the revocation above.
  const role = await resolveGoogleRole({ ...user.toObject?.() ?? user, email: normalisedEmail });

  // Same secret as the existing auth middleware, so /api routes guarded by
  // middleware/auth.js accept these tokens today. Claims mirror that contract:
  // { sub: user id, role, ... }. Future claim/verify endpoints should gate on
  // the lowercase roles defined here.
  // `via` records HOW this session was proven, which is not the same question as
  // who it belongs to. Setting a password without knowing the old one is allowed
  // only for a session Google itself just vouched for — that is the whole recovery
  // path for someone who has forgotten the password they set here (see
  // controllers/profileController.js `setPassword`). A session opened WITH that
  // password cannot silently rotate it.
  const sessionToken = jwt.sign(
    { sub: user.id, role, email: normalisedEmail, via: 'google' },
    process.env.JWT_SECRET,
    { expiresIn: SESSION_TTL }
  );

  res.json({ sessionToken, role, email: normalisedEmail });
};
