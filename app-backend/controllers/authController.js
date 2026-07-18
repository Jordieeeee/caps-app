const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Collector = require('../models/Collector');
const Consumer = require('../models/Consumer');
const RefreshToken = require('../models/RefreshToken');
const httpError = require('../utils/httpError');
const ErrorCodes = require('../utils/errorCodes');

/** Which model a role's documents live in — the single source of truth for
 * every role-dispatch in this file (login, refresh, me). */
const MODEL_BY_ROLE = { Collector, Consumer, Admin: User };

const DAY_MS = 24 * 60 * 60 * 1000;

const ACCOUNT_DISABLED_MESSAGE =
  'This account has been deactivated. Please contact the Tanauan City Water District office.';

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

exports.login = async (req, res) => {
  const { email, password } = req.body;
  // The client never says which role it's logging in as (single unified login
  // form), so try each collection in turn until one has this email.
  const user =
    (await Collector.findByEmail(email)) ||
    (await Consumer.findByEmail(email)) ||
    (await User.findByEmail(email));

  // Verify the password before considering account status. Reporting
  // ACCOUNT_DISABLED to someone who has not proven they own the account would
  // turn this endpoint into an account-existence oracle.
  if (!user || !(await user.comparePassword(password))) {
    throw httpError(401, 'Invalid email or password.', ErrorCodes.INVALID_CREDENTIALS);
  }
  assertActive(user);

  res.json(await issueSession(user));
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
  res.json({ user });
};
