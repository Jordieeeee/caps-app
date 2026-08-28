const GoogleUser = require('../models/GoogleUser');
const MobileCredential = require('../models/MobileCredential');
const httpError = require('../utils/httpError');
const ErrorCodes = require('../utils/errorCodes');
const { passwordProblem } = require('../utils/passwordPolicy');
const { resolveGoogleRole } = require('../utils/googleRole');

/**
 * PUT /auth/password — set or replace the password on a Google identity.
 *
 * ROLE-NEUTRAL, and that is the whole reason it lives here rather than beside a
 * profile. The credential belongs to the `google_users` row, not to a consumer's
 * registry record or a collector's employment record: both roles reach this
 * endpoint, both get the same row, and the only difference between them is which
 * screen sent the request. It started life inside the consumer profile controller
 * and had to move the moment collectors needed the same thing — a second copy
 * there would have been two implementations of one credential.
 *
 * See models/MobileCredential.js for why the password is stored against the
 * identity rather than as a new `consumers` document, and what breaks if that is
 * ever changed.
 *
 * ## Who may call it
 *
 * Only a Google-flow session. A password consumer or a seeded/portal collector
 * already has a credential and it is the Admin Portal's to change — offering to
 * overwrite it from here would put two applications behind one login with no
 * agreement about which wins. They are told to go to the office rather than being
 * given a form that always fails.
 *
 * An `unclaimed` identity is refused too. They have no account with the district
 * yet; a password would be a credential for nothing, and the screen that calls
 * this is not reachable for them.
 *
 * ## When the current password is required
 *
 * Only when there IS one AND this session was opened with it (`via: 'password'`).
 * A session Google vouched for is the recovery path — someone who has forgotten
 * the password they set here signs in with Google and sets a new one — and
 * requiring the forgotten password in order to replace the forgotten password
 * would close the only door they have left. A session opened WITH the password
 * cannot rotate it silently: a handed-over unlocked phone must not be able to lock
 * its owner out.
 */
exports.setPassword = async (req, res) => {
  const user = await GoogleUser.findById(req.user.sub).lean();
  if (!user || !user.email) {
    throw httpError(
      409,
      'This account already signs in with an email and password. To change it, contact the Tanauan City Water District office.',
      ErrorCodes.NOT_SUPPORTED
    );
  }

  // Re-derived, never read from the token: a role claim minted before an admin
  // removed someone from the allowlist must not outvote the row recording it.
  const role = await resolveGoogleRole(user);
  if (role !== 'consumer' && role !== 'collector') {
    throw httpError(
      403,
      'Verify your account with the district before setting a password.',
      ErrorCodes.ROLE_NOT_PERMITTED
    );
  }

  const password = String(req.body.password ?? '');
  // utils/passwordPolicy.js — the same three rules the app draws as a live
  // checklist. Enforced here regardless of what the client showed: the checklist
  // is a courtesy, this is the gate.
  const problem = passwordProblem(password);
  if (problem) throw httpError(400, problem, ErrorCodes.PASSWORD_REJECTED);

  const existing = await MobileCredential.findByGoogleUser(user._id);
  if (existing && req.user.via === 'password') {
    const current = String(req.body.currentPassword ?? '');
    if (!current || !(await existing.comparePassword(current))) {
      throw httpError(400, 'Your current password is incorrect.', ErrorCodes.PASSWORD_REJECTED);
    }
  }

  // The email comes off the identity, not the body or even the token: it is what
  // the sign-in screen will look this credential up by, and the one on the row is
  // the address Google last verified.
  await MobileCredential.setFor({
    googleUserId: user._id,
    email: user.email,
    password,
  });

  // No new session. The caller is already signed in and a password change is not a
  // re-authentication — reissuing here would be a token rotation hidden inside a
  // settings screen.
  res.json({ email: user.email, hasPassword: true });
};

/**
 * GET /auth/password — just the credential state, for the screen that sets it.
 *
 * Exists because the Password screen was reading a whole profile to draw a form.
 * On the collector side that meant `GET /profile/collector`: resolve the scope
 * (identity, allowlist, registry), load the employment record (registry again),
 * then count every meter reading the collector has ever filed — six sequential
 * round trips to Atlas, measured at ~980ms, for a screen that needs an email
 * address and two booleans. The consumer side was the same shape.
 *
 * This is two indexed lookups by `_id`. The email the form displays does not come
 * from here at all: both apps already hold it in the session, so it needs no
 * request of its own.
 *
 * The ROLE is taken from the token claim rather than re-derived from the
 * allowlist, and that is a deliberate split, not a shortcut. This decides what a
 * screen draws; `setPassword` above decides whether a password may be written, and
 * it re-reads the role from the database every time. A stale claim here costs at
 * worst a form that the write path then refuses — it can never grant anything.
 */
exports.state = async (req, res) => {
  const user = await GoogleUser.findById(req.user.sub).lean();
  if (!user) {
    // A password-system session: `sub` is a consumers/collectors id, which is not
    // in this collection. They already have a credential and it is the office's.
    return res.json({ canSetPassword: false, hasPassword: true });
  }

  const claimed = req.user.role === 'consumer' || req.user.role === 'collector';
  const credential = claimed ? await MobileCredential.findByGoogleUser(user._id) : null;

  res.json({ canSetPassword: claimed, hasPassword: !!credential });
};

/**
 * Whether this caller can hold a password of this kind, and whether they do.
 *
 * Shared by both profile endpoints so the two screens ask the same question and
 * get an answer computed one way. Two booleans rather than one, because "may I
 * offer this?" and "is it already set?" are genuinely separate and a single flag
 * forces the client to guess which it was told.
 */
exports.passwordState = async function passwordState(req, isGoogleIdentity) {
  if (!isGoogleIdentity) return { canSetPassword: false, hasPassword: true };
  const credential = await MobileCredential.findByGoogleUser(req.user.sub);
  return { canSetPassword: true, hasPassword: !!credential };
};
