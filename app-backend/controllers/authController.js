const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { passwordProblem } = require('../utils/passwordPolicy');
const { resolveGoogleRole } = require('../utils/googleRole');
const Collector = require('../models/Collector');
const Consumer = require('../models/Consumer');
const GoogleUser = require('../models/GoogleUser');
const MobileCredential = require('../models/MobileCredential');
const AppCredential = require('../models/AppCredential');
const RefreshToken = require('../models/RefreshToken');
const httpError = require('../utils/httpError');
const ErrorCodes = require('../utils/errorCodes');

/** Which model a role's documents live in — the single source of truth for
 * every role-dispatch in this file (login, refresh, me). */
const MODEL_BY_ROLE = { Collector, Consumer, Admin: User };

/** The Admin Portal spells roles in lowercase; the mobile session (JWT claim,
 * MODEL_BY_ROLE, REFRESH_TTL_MS) is keyed on the capitalised form. */
const ROLE_FROM_CREDENTIAL = { collector: 'Collector', consumer: 'Consumer', admin: 'Admin' };
function normaliseRole(role) {
  return ROLE_FROM_CREDENTIAL[String(role).toLowerCase()] || role;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const ACCOUNT_DISABLED_MESSAGE =
  'This account has been deactivated. Please contact the Tanauan City Water District office.';

const ACCOUNT_LOCKED_MESSAGE =
  'This account is temporarily locked. Please try again later or contact the Tanauan City Water District office.';

/**
 * A portal credential is usable only if it is active and not currently locked.
 *
 * `mustChangePassword` / `tempPasswordExpiresAt` are deliberately NOT enforced
 * here: the mobile app has no change-password flow yet, so enforcing the temp
 * password would lock a freshly-created portal account out of mobile entirely,
 * with no way to self-recover. The product decision is to let them in on the temp
 * password for now. Follow-up: a forced change-password screen, at which point
 * both flags should start gating here.
 */
function assertCredentialUsable(cred) {
  if (cred.status !== 'active') {
    throw httpError(403, ACCOUNT_DISABLED_MESSAGE, ErrorCodes.ACCOUNT_DISABLED);
  }
  if (cred.isLocked()) {
    throw httpError(403, ACCOUNT_LOCKED_MESSAGE, ErrorCodes.ACCOUNT_DISABLED);
  }
}

/**
 * Refresh lifetime is deliberately role-dependent.
 *
 * A collector can be off-network for weeks on a rural route, and their refresh
 * token is the only thing standing between them and a re-login they physically
 * cannot perform without signal — so theirs is long. A consumer is never expected
 * to authenticate offline, so theirs is short; there is no upside to leaving a
 * long-lived credential sitting on a member of the public's handset.
 */
const REFRESH_TTL_MS = {
  Collector: Number(process.env.REFRESH_TTL_COLLECTOR_DAYS || 90) * DAY_MS,
  Consumer: Number(process.env.REFRESH_TTL_CONSUMER_DAYS || 30) * DAY_MS,
  Admin: Number(process.env.REFRESH_TTL_ADMIN_DAYS || 1) * DAY_MS,
};

function signAccessToken(user) {
  return jwt.sign({ sub: user.id, role: user.role, name: user.name }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
  });
}

/** Issue a fresh access/refresh pair and describe the session to the client. */
async function issueSession(user) {
  const ttl = REFRESH_TTL_MS[user.role];
  const refreshToken = await RefreshToken.issue(user.id, ttl, user.role);
  return {
    accessToken: signAccessToken(user),
    refreshToken,
    // Sent explicitly so the client never has to decode the JWT to schedule a refresh.
    accessTokenExpiresAt: new Date(Date.now() + accessTtlMs()).toISOString(),
    refreshTokenExpiresAt: new Date(Date.now() + ttl).toISOString(),
    user,
  };
}

/** Access-token lifetime in ms, parsed from the same env value used to sign it. */
function accessTtlMs() {
  const raw = process.env.JWT_EXPIRES_IN || '15m';
  const match = /^(\d+)([smhd])$/.exec(raw.trim());
  if (!match) return 15 * 60 * 1000;
  const units = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: DAY_MS };
  return Number(match[1]) * units[match[2]];
}

function assertActive(user) {
  if (user.status !== 'active') {
    throw httpError(403, ACCOUNT_DISABLED_MESSAGE, ErrorCodes.ACCOUNT_DISABLED);
  }
}

/**
 * Public self-service enrolment. Always creates a Consumer.
 *
 * A `role` in the body is ignored, not rejected: honouring a client-supplied role
 * on an unauthenticated endpoint would let anyone mint themselves a Collector or
 * Admin account. Staff accounts are created by an Admin in the portal, never here.
 */
exports.register = async (req, res) => {
  const { name, email, password } = req.body;

  // Enrolment enforced nothing at all: the "at least 8 characters" on the sign-up
  // screen was a client-side courtesy, so `POST /auth/register` would happily
  // create a consumer whose password was one character. The rule the app has
  // always displayed is now the rule the server keeps — see utils/passwordPolicy.js.
  const problem = passwordProblem(password);
  if (problem) throw httpError(400, problem, ErrorCodes.PASSWORD_REJECTED);
  // Email must be unique across all three collections now that each role
  // lives apart — one index can no longer cover all of them.
  if (
    (await Collector.findByEmail(email)) ||
    (await Consumer.findByEmail(email)) ||
    (await User.findByEmail(email))
  ) {
    throw httpError(409, 'Email already registered');
  }

  const consumer = await Consumer.createWithPassword({ name, email, password });
  res.status(201).json(await issueSession(consumer));
};

/**
 * Resolve an email + password to the profile document that should hold the session,
 * or null if the credentials don't match anything.
 *
 * Two credential stores are consulted, in order:
 *
 *   1. `appcredentials` — the Admin Portal's login store, and the system of record
 *      for every staff/consumer account created in the portal. The login email
 *      lives here and often differs from the profile's own email, so this must be
 *      tried first: the portal account is otherwise completely invisible to mobile.
 *   2. The per-role profile collections' own `passwordHash` — how the mobile app's
 *      own seed/registration path stores credentials. Kept as a fallback so seeded
 *      dev logins and self-registered consumers (which have no `appcredentials`
 *      row) still work.
 *
 * In both paths the password is verified before any account-status is revealed:
 * reporting "disabled" to someone who hasn't proven they own the account would turn
 * this endpoint into an account-existence oracle. A wrong password always returns
 * null (→ 401); a correct password on an unusable account throws 403, because at
 * that point ownership is already proven.
 */
async function authenticate(email, password) {
  const cred = await AppCredential.findByEmail(email);
  if (cred) {
    if (!(await cred.comparePassword(password))) return null;
    assertCredentialUsable(cred);
    const role = normaliseRole(cred.role);
    const Model = MODEL_BY_ROLE[role];
    const profile = Model && (await Model.findById(cred.profileId));
    if (!profile) {
      // Correct password, but the credential points at a profile that no longer
      // exists — a portal-side data problem, not a bad password. Don't mask it as
      // one; ownership is already proven, so there is no oracle to protect.
      throw httpError(
        409,
        'Your account is not fully set up yet. Please contact the Tanauan City Water District office.',
        ErrorCodes.ACCOUNT_DISABLED
      );
    }
    // Portal-created consumer/collector profiles carry no `email` of their own
    // (the portal's registry doesn't store it) — the login email lives only on
    // the credential we just matched against.
    if (!profile.email) profile.email = cred.email;
    return profile;
  }

  // Legacy / seeded accounts that carry their own passwordHash. Same order the
  // unified login form has always used.
  const user =
    (await Collector.findByEmail(email)) ||
    (await Consumer.findByEmail(email)) ||
    (await User.findByEmail(email));
  if (!user || !(await user.comparePassword(password))) return null;
  return user;
}

/**
 * The third credential store: a password a Google consumer or collector set on
 * themselves.
 *
 * Tried LAST, deliberately. `appcredentials` is the district's system of record and
 * must always win — if the office later issues a real portal login for the same
 * address, that login takes over and the row here goes dormant rather than
 * competing with it.
 *
 * What comes back is NOT a StoredSession. It is the same `{ sessionToken, role,
 * email }` the Google callback returns, with the same `sub` — because that is the
 * whole design: the password is a second way into one identity, so the session it
 * opens has to be the identity's own. Hand back a password-system session here and
 * `requireConsumerScope` would resolve `sub` as a `consumers._id`, match no service
 * connection, and show the consumer an app with none of their accounts in it.
 *
 * The role is re-read from the database rather than assumed. A credential set while
 * someone held a claim must not keep letting them in as a consumer after an admin
 * has unlinked it.
 */
async function authenticateMobileCredential(email, password) {
  const credential = await MobileCredential.findByEmail(email);
  if (!credential || !(await credential.comparePassword(password))) return null;

  const user = await GoogleUser.findById(credential.googleUserId).lean();
  if (!user) return null;

  /**
   * The role is re-derived, exactly as the Google callback derives it — never read
   * off the row. utils/googleRole.js explains why that distinction is
   * security-relevant: a collector's standing lives in the allowlist and NOT in
   * `google_users.role`, so reading the row would let an ex-collector keep
   * collector sessions through the password door long after the office revoked
   * them. Consumers are re-checked by the same call for free.
   */
  const role = await resolveGoogleRole(user);
  // 'unclaimed' has nothing to sign in to but the claim flow, and could not have
  // set a password in the first place. Refused rather than admitted to a shell
  // with no account behind it.
  if (role !== 'consumer' && role !== 'collector') return null;

  const sessionToken = jwt.sign(
    // `via: 'password'` — this session was opened with the password itself, which
    // is what stops it from silently rotating that password. See
    // controllers/credentialController.js `setPassword`.
    { sub: String(user._id), role, email: user.email, via: 'password' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.GOOGLE_SESSION_TTL || '7d' }
  );

  return { sessionToken, role, email: user.email };
}

exports.login = async (req, res) => {
  const { email, password } = req.body;

  const user = await authenticate(email, password);
  if (user) {
    // Profile-level status gate. For a portal account this is in addition to the
    // credential's own status, already checked in authenticate().
    assertActive(user);
    return res.json(await issueSession(user));
  }

  const googleSession = await authenticateMobileCredential(email, password);
  if (googleSession) return res.json(googleSession);

  throw httpError(401, 'Invalid email or password.', ErrorCodes.INVALID_CREDENTIALS);
};

/**
 * Exchange a refresh token for a new session, rotating the token.
 *
 * Rotation means a stolen token is usable at most once before the theft becomes
 * visible: when an already-rotated token is presented again, either an attacker
 * or the real device is replaying it and we cannot tell which — so the whole
 * family is revoked and the user re-authenticates.
 */
exports.refresh = async (req, res) => {
  const { refreshToken } = req.body;
  const invalid = () =>
    httpError(
      401,
      'Your session has expired. Please sign in again.',
      ErrorCodes.REFRESH_TOKEN_INVALID
    );

  const stored = await RefreshToken.findOne({ tokenHash: RefreshToken.hash(refreshToken) });
  if (!stored) throw invalid();

  if (stored.revokedAt !== null) {
    // Only a *rotated* token (one with a successor) being presented again implies
    // theft — the legitimate holder would have moved on to the replacement. A token
    // revoked by an explicit logout has no successor and is simply dead: treating
    // that as theft would let a logout on one handset nuke the user's sessions on
    // every other device they own.
    if (stored.replacedByHash !== null) {
      await RefreshToken.revokeAllForUser(stored.user);
      console.warn(`Refresh token reuse detected for user ${stored.user}; revoked all sessions.`);
    }
    throw invalid();
  }
  if (!stored.isLive()) throw invalid();

  // Re-read the user on every refresh: this is the point at which an account
  // deactivated mid-session actually loses access.
  //
  // `stored.role` says which collection to check. Tokens issued before this
  // field existed have none — fall back to trying all three, same order as
  // login, rather than requiring a backfill migration.
  const user = stored.role
    ? await MODEL_BY_ROLE[stored.role].findById(stored.user)
    : (await Collector.findById(stored.user)) ||
      (await Consumer.findById(stored.user)) ||
      (await User.findById(stored.user));
  if (!user) throw invalid();
  if (user.status !== 'active') {
    await RefreshToken.revokeAllForUser(user.id);
    throw httpError(403, ACCOUNT_DISABLED_MESSAGE, ErrorCodes.ACCOUNT_DISABLED);
  }

  // A portal account is also gated by its credential, which the portal can disable
  // or lock without touching the profile doc — so re-check it here too. A disabled
  // credential ends every session, exactly like a disabled profile; a temporary
  // lock only blocks this one refresh and is not grounds to revoke other devices.
  const cred = await AppCredential.findByProfile(user.id);
  if (cred && cred.status !== 'active') {
    await RefreshToken.revokeAllForUser(user.id);
    throw httpError(403, ACCOUNT_DISABLED_MESSAGE, ErrorCodes.ACCOUNT_DISABLED);
  }
  if (cred && cred.isLocked()) {
    throw httpError(403, ACCOUNT_LOCKED_MESSAGE, ErrorCodes.ACCOUNT_DISABLED);
  }
  // Same portal-profile gap as authenticate(): backfill email so a refreshed
  // session doesn't drop it from the `user` the client already has.
  if (cred && !user.email) user.email = cred.email;

  const session = await issueSession(user);
  stored.revokedAt = new Date();
  stored.replacedByHash = RefreshToken.hash(session.refreshToken);
  await stored.save();

  res.json(session);
};

/** Revoke this device's session. Idempotent — logging out twice is not an error. */
exports.logout = async (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    await RefreshToken.updateOne(
      { tokenHash: RefreshToken.hash(refreshToken), revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );
  }
  res.status(204).end();
};

exports.me = async (req, res) => {
  const Model = MODEL_BY_ROLE[req.user.role] || User;
  const user = await Model.findById(req.user.sub);
  if (!user) throw httpError(404, 'User not found');
  assertActive(user);
  // Same portal-profile gap as authenticate()/refresh().
  if (!user.email) {
    const cred = await AppCredential.findByProfile(user.id);
    if (cred) user.email = cred.email;
  }
  res.json({ user });
};
