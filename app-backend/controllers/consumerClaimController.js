const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const Account = require('../models/Account');
const Consumer = require('../models/Consumer');
const ServiceConnection = require('../models/ServiceConnection');
const ConsumerLink = require('../models/ConsumerLink');
const GoogleUser = require('../models/GoogleUser');
const ClaimAttempt = require('../models/ClaimAttempt');
const OtpCode = require('../models/OtpCode');
const { OTP_TTL_MS } = require('../models/OtpCode');
const {
  FAILURE_WINDOW_MS,
  MAX_FAILURES_PER_WINDOW,
} = require('../models/ClaimAttempt');
const httpError = require('../utils/httpError');
const ErrorCodes = require('../utils/errorCodes');
const { maskMobile, normaliseMobile } = require('../utils/phone');
const { sendOtp, OtpDeliveryError } = require('../services/otp-sender');

/**
 * POST /consumer/claim-account and POST /consumer/verify-claim.
 *
 * The claim proves, via a code sent to the mobile number ALREADY ON FILE in
 * the district registry, that the person behind a Google identity controls
 * the household's phone. Success mints exactly one active ConsumerLink —
 * which is the ONLY artifact any consumer billing endpoint may consult.
 * Nothing here reads an accountNumber from anywhere except as a lookup key;
 * no response field is ever derived from unverified request input beyond it.
 *
 * Every failure below answers with one generic message per class (see the MSG_
 * constants). No message distinguishes "wrong code" from "expired" from
 * "never issued", and nothing reveals whether an account exists beyond the
 * unavoidable 404 the spec mandates — there is no oracle worth handing out.
 */

const MSG_RATE_LIMITED = 'Too many attempts. Please try again later.';
const MSG_RESEND_COOLDOWN = 'Please wait a minute before requesting another code.';
const MSG_ACCOUNT_NOT_FOUND = "We couldn't find that account number.";
// Wording mandated by the spec — do not soften or localise casually; it is the
// one place the flow tells the consumer to go offline to fix something.
const MSG_NO_MOBILE_ON_FILE =
  'no mobile number on file — contact TWD to register one';
const MSG_ALREADY_CLAIMED = 'This account has already been claimed.';
const MSG_ALREADY_YOURS = 'This account is already on your profile.';

/**
 * How many water accounts one identity may hold at once.
 *
 * A cap has to exist before the claim endpoints admit repeat callers: without
 * one, "link another account" is an unbounded loop that costs an SMS per turn
 * and hands one login the whole district if it is ever run against a leaked
 * list of account numbers. Five matches MAX_PENDING_REQUESTS in
 * accountController — two houses is the real case, five leaves room for a
 * family, and it stops one profile becoming a landlord's portal.
 *
 * types/auth.ts in the app already told clients "a server-enforced cap" existed.
 * Until now it did not. This is it.
 */
const MAX_LINKED_ACCOUNTS = 5;
const MSG_ACCOUNT_LIMIT_REACHED =
  `You can have up to ${MAX_LINKED_ACCOUNTS} water accounts on one profile. ` +
  'Please contact the Tanauan City Water District office if you need another.';
// One wording for wrong / expired / superseded / never-issued. Deliberately
// does NOT say which — see the class comment.
const MSG_VERIFY_FAILED = 'Verification failed. Please try again.';
// Gateway-level failure only (OtpDeliveryError). Deliberately says nothing
// about the account or the number — the client just learns "send failed, retry".
const MSG_OTP_UNDELIVERED =
  "We couldn't send the verification code right now. Please try again in a few minutes.";

/** Six digits, uniformly padded so leading zeros survive hashing. */
function generateOtp() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

function normaliseAccountNumber(raw) {
  return String(raw || '').trim();
}

/**
 * Registry lookup: accountNumber → the mobile number TWD has on file.
 *
 * Chain (per how this data actually lives — see models/ServiceConnection.js):
 *   accounts.accountNumber → serviceconnections.accountNo/consumerId →
 *   consumers.contacts[] where contactType === 'mobile'.
 *
 * Returns { maskedNumber, mobile, consumerId } or throws:
 *   404 when the ACCOUNT itself doesn't exist,
 *   400 when it exists but no verified mobile can be resolved for it
 *       (no connection row, dangling consumerId, or no usable contacts entry).
 * The distinction is the spec's: an unknown number and a numberless household
 * need different remedies, and neither message leaks registry internals.
 */
async function resolveAccountMobile(accountNumber) {
  const account = await Account.findOne({ accountNumber }).lean();
  if (!account) {
    throw httpError(404, MSG_ACCOUNT_NOT_FOUND, ErrorCodes.NOT_FOUND);
  }

  // A portal connection row may be missing or point at a purged registry doc
  // (the dangling-reference problem documented on Account.consumerIds — the
  // same disease reaches serviceconnections eventually). All of those land in
  // the same "contact the office" bucket; none is distinguishable from the
  // outside.
  const connection = await ServiceConnection.findOne({ accountNo: accountNumber })
    .sort({ createdAt: -1 })
    .lean();
  const consumer = connection?.consumerId
    ? await Consumer.findById(connection.consumerId).lean()
    : null;

  // Mobile selection is deliberately STRICTER than utils/consumerIdentity's
  // primaryContact(): that helper falls back to ANY contact entry (a landline,
  // an office line), which is fine for display and unacceptable as a proof
  // channel — an OTP to a number nobody's phone receives verifies nothing.
  // Prefer the primary-flagged MOBILE, then any mobile, then nothing.
  const contacts = Array.isArray(consumer?.contacts) ? consumer.contacts : [];
  const mobileEntry =
    contacts.find((c) => c && c.contactType === 'mobile' && c.isPrimary && c.value) ||
    contacts.find((c) => c && c.contactType === 'mobile' && c.value);

  if (!mobileEntry) {
    throw httpError(400, MSG_NO_MOBILE_ON_FILE, ErrorCodes.NO_MOBILE_ON_FILE);
  }

  // A contacts entry that exists but isn't a rescuable PH mobile (portal-typed
  // junk, landline pasted into the mobile field) gets the same answer as
  // having none: the remedy — contact the office — is identical, and the
  // distinction would leak nothing useful to the caller anyway. The sender
  // additionally normalises defensively, but the controller validates here so
  // the user learns about unusable data BEFORE we mint a doomed challenge.
  const normalisedMobile = normaliseMobile(mobileEntry.value);
  if (!normalisedMobile) {
    throw httpError(400, MSG_NO_MOBILE_ON_FILE, ErrorCodes.NO_MOBILE_ON_FILE);
  }

  return {
    maskedNumber: maskMobile(normalisedMobile),
    mobileValue: normalisedMobile,
    consumerId: String(connection.consumerId),
  };
}

/** True when this account has crossed the sliding-window failure threshold. */
async function isRateLimited(accountNumber, now = new Date()) {
  const windowStart = new Date(now.getTime() - FAILURE_WINDOW_MS);
  const failures = await ClaimAttempt.countDocuments({
    accountNumber,
    success: false,
    attemptedAt: { $gte: windowStart },
  });
  if (failures < MAX_FAILURES_PER_WINDOW) return false;

  // Flag the window's rows once for staff review. Idempotent via the filter,
  // so repeated locked-out attempts don't rewrite history each time.
  await ClaimAttempt.updateMany(
    { accountNumber, success: false, attemptedAt: { $gte: windowStart }, flagged: false },
    { $set: { flagged: true } }
  );
  console.warn(
    `[claim] Rate limit tripped for account ${accountNumber} (${failures} failures in window); rows flagged for review.`
  );
  return true;
}

/**
 * Claim step 1 — issue a challenge.
 * Auth: middleware/auth + requireGoogleRoles('unclaimed').
 */
exports.claimAccount = async (req, res) => {
  const dbUser = req.dbUser; // attached by requireGoogleRoles, DB-derived role
  const accountNumber = normaliseAccountNumber(req.body.accountNumber);
  const now = new Date();

  if (await isRateLimited(accountNumber, now)) {
    throw httpError(429, MSG_RATE_LIMITED, ErrorCodes.RATE_LIMITED);
  }

  // Resend cooldown: an unconsumed, still-live code issued <60s ago means the
  // last challenge probably hasn't even arrived yet. Checked BEFORE registry
  // work so hammering resend can't be used as a cheap registry probe.
  const recentIssueCutoff = new Date(now.getTime() - 60_000);
  const recent = await OtpCode.findOne({
    userId: dbUser._id,
    accountNumber,
    consumed: false,
    expiresAt: { $gt: now },
    createdAt: { $gt: recentIssueCutoff },
  }).lean();
  if (recent) {
    throw httpError(429, MSG_RESEND_COOLDOWN, ErrorCodes.RATE_LIMITED);
  }

  /**
   * Both guards run BEFORE resolveAccountMobile, and that ordering is the point:
   * everything below this line costs an SMS and consumes the caller's resend
   * budget. A consumer who is at their cap, or who typed an account somebody
   * else already holds, can be told so without a text being sent and without
   * a minute-long cooldown they gained nothing from.
   *
   * Neither case was reachable while this endpoint only admitted 'unclaimed'
   * identities — a first-time claimer holds no links at all. Admitting
   * 'consumer' is what creates them, so the guards ship in the same change.
   */
  const existing = await ConsumerLink.findOne({ accountNumber, removedAt: null }).lean();
  if (existing) {
    // Distinguishing "yours" from "somebody else's" is deliberate. It is not an
    // account-existence oracle — the NOT_FOUND below already answers that
    // question for any account number — and the two need different actions from
    // the consumer: one is "you already have this, go look", the other is "this
    // is a dispute, call the office".
    const mine = String(existing.userId) === String(dbUser._id);
    throw httpError(
      409,
      mine ? MSG_ALREADY_YOURS : MSG_ALREADY_CLAIMED,
      ErrorCodes.ALREADY_CLAIMED
    );
  }

  const held = await ConsumerLink.countDocuments({ userId: dbUser._id, removedAt: null });
  if (held >= MAX_LINKED_ACCOUNTS) {
    throw httpError(409, MSG_ACCOUNT_LIMIT_REACHED, ErrorCodes.ACCOUNT_LIMIT_REACHED);
  }

  const { maskedNumber, mobileValue } = await resolveAccountMobile(accountNumber);

  // Supersede prior live challenges for this pair: one code valid at a time
  // shrinks the guessing window and matches what the user was told last.
  await OtpCode.updateMany(
    { userId: dbUser._id, accountNumber, consumed: false },
    { $set: { consumed: true } }
  );

  const code = generateOtp();
  const codeHash = await bcrypt.hash(code, 10);
  await OtpCode.create({
    userId: dbUser._id,
    accountNumber,
    codeHash,
    expiresAt: new Date(now.getTime() + OTP_TTL_MS),
  });

  // The plaintext code's LAST stop. Gateway-level failure is a DISTINCT
  // outcome (502 + SMS_DELIVERY_FAILED): the account was found and a code
  // exists, but it never went out — "try again soon" is honest here, unlike
  // every other failure where retrying changes nothing. OtpDeliveryError
  // carries pre-scrubbed diagnostics only; the axios request body (which
  // contains the code) is never part of that object. Anything else thrown by
  // sendOtp is misconfiguration and fails CLOSED as a generic 500.
  try {
    await sendOtp(mobileValue, code);
  } catch (err) {
    if (err instanceof OtpDeliveryError) {
      console.error(
        `[claim] OTP delivery failed for account ${accountNumber}: ${err.message}` +
          (err.detail ? ` (${err.detail})` : '')
      );
      throw httpError(502, MSG_OTP_UNDELIVERED, ErrorCodes.SMS_DELIVERY_FAILED);
    }
    throw err;
  }

  res.json({ challenge: 'otp', maskedNumber });
};

/**
 * Claim step 2 — verify the code, mint the link, promote the role.
 * Auth: middleware/auth + requireGoogleRoles('unclaimed').
 */
exports.verifyClaim = async (req, res) => {
  const dbUser = req.dbUser;
  const accountNumber = normaliseAccountNumber(req.body.accountNumber);
  const submittedCode = String(req.body.code ?? '').trim();
  const now = new Date();

  async function logAttempt(success) {
    await ClaimAttempt.create({
      userId: dbUser._id,
      accountNumber,
      success,
      attemptedAt: now,
    });
  }

  // Brute-force gate FIRST — before hash comparison, format checks, anything.
  // Without it, verify would be an unlimited online guessing oracle against a
  // 10^6 keyspace; with it, five bad tries cost the attacker the hour.
  if (await isRateLimited(accountNumber, now)) {
    throw httpError(429, MSG_RATE_LIMITED, ErrorCodes.RATE_LIMITED);
  }

  // Cheap rejection of malformed submissions, logged like any other failure.
  if (!/^\d{6}$/.test(submittedCode)) {
    await logAttempt(false);
    throw httpError(400, MSG_VERIFY_FAILED, ErrorCodes.OTP_INVALID);
  }

  const otp = await OtpCode.findOne({
    userId: dbUser._id,
    accountNumber,
    consumed: false,
  }).sort({ createdAt: -1 });

  if (!otp) {
    await logAttempt(false);
    throw httpError(400, MSG_VERIFY_FAILED, ErrorCodes.OTP_INVALID);
  }
  if (otp.expiresAt <= now) {
    // Consume expired challenges so they can't linger as confusing state.
    otp.consumed = true;
    await otp.save();
    await logAttempt(false);
    throw httpError(400, MSG_VERIFY_FAILED, ErrorCodes.OTP_INVALID);
  }

  const matched = await bcrypt.compare(submittedCode, otp.codeHash);
  await logAttempt(matched); // audit BEFORE mutations, so crashes still leave a trail

  if (!matched) {
    throw httpError(400, MSG_VERIFY_FAILED, ErrorCodes.OTP_INVALID);
  }

  // Consume atomically: a replayed correct code racing itself must find
  // consumed already flipped by whichever request won.
  const consumed = await OtpCode.updateOne(
    { _id: otp._id, consumed: false },
    { $set: { consumed: true } }
  );
  if (consumed.modifiedCount === 0) {
    throw httpError(400, MSG_VERIFY_FAILED, ErrorCodes.OTP_INVALID);
  }

  // THE grant. The partial unique index makes double-claiming structurally
  // impossible; the loser of a race adopts the winner's link instead of 500ing.
  let link = await ConsumerLink.findActive({ userId: dbUser._id, accountNumber });
  if (!link) {
    try {
      link = await ConsumerLink.create({
        userId: dbUser._id,
        accountNumber,
        verifiedVia: 'otp',
      });
    } catch (err) {
      if (err.code !== 11000) throw err;
      link = await ConsumerLink.findActive({ userId: dbUser._id, accountNumber });
      if (!link) {
        // The partial unique index rejected us and the winning row is not ours:
        // somebody else claimed this account in the window between our code
        // being issued and answered. Rare, but it used to surface as a 500 —
        // after the consumer had typed a CORRECT code, which reads as "the app
        // is broken" when the truth is "that account is spoken for".
        //
        // The code stays consumed. It was correct, it was used, and re-issuing
        // it would not help: the account is unavailable, not the proof.
        throw httpError(409, MSG_ALREADY_CLAIMED, ErrorCodes.ALREADY_CLAIMED);
      }
    }
  }

  // Promote, guarded: only an actual 'unclaimed' moves to 'consumer', so this
  // write can never clobber a collector standing on some other path.
  await GoogleUser.updateOne(
    { _id: dbUser._id, role: 'unclaimed' },
    { $set: { role: 'consumer' } }
  );

  // Fresh session reflecting the new role — same shape/signing as the Google
  // callback, so the client swaps tokens with one code path. The OLD token
  // stays valid until natural expiry (stateless JWTs have no kill switch);
  // its 'unclaimed' role simply stops matching these endpoints' DB-derived
  // checks from now on.
  const sessionToken = jwtSignSession(dbUser, 'consumer');

  res.json({ sessionToken, role: 'consumer', email: dbUser.email });
};

/** Fresh session token, same signing contract as googleAuthController — the
 * client swaps old for new with one code path. */
function jwtSignSession(user, role) {
  return jwt.sign(
    // `via: 'google'` for the same reason the callback sets it: this session was
    // proven by Google plus an SMS code, not by a password. See
    // controllers/googleAuthController.js.
    { sub: String(user._id), role, email: user.email, via: 'google' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.GOOGLE_SESSION_TTL || '7d' }
  );
}
