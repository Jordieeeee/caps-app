const GoogleUser = require('../models/GoogleUser');
const CollectorAllowlist = require('../models/CollectorAllowlist');
const ConsumerLink = require('../models/ConsumerLink');
const httpError = require('../utils/httpError');
const ErrorCodes = require('../utils/errorCodes');

/**
 * Admin-only routes: collector allowlist management and consumer-link
 * unlinks. Every handler here runs behind middleware/admin.requireDbAdmin,
 * which has already loaded the acting portal admin onto req.admin.
 */

const MSG_ENTRY_EXISTS = 'That email is already on the allowlist.';
const MSG_NO_ACTIVE_ENTRY = 'No active allowlist entry for that email.';
const MSG_LINK_TARGET_REQUIRED = 'Provide either accountNumber or userId.';
const MSG_NO_ACTIVE_LINK = 'No active consumer link matches that.';

function normaliseEmail(raw) {
  return String(raw || '').toLowerCase().trim();
}

/**
 * GET /admin/collector-allowlist
 *
 * Active entries only, oldest grants first — matches how the office reads a
 * roster ("who have we enabled, and roughly when"). removedAt-filtered so
 * revoked emails don't reappear in tooling that would let them be "removed"
 * again; the audit trail stays queryable in Mongo directly. addedBy is
 * resolved to the granting admin's portal email because an id is useless
 * when asking "who did this".
 */
exports.listAllowlist = async (req, res) => {
  const entries = await CollectorAllowlist.find({ removedAt: null })
    .sort({ createdAt: 1 })
    .select('email createdAt addedBy')
    .populate('addedBy', 'email')
    .lean();

  res.json({
    entries: entries.map((e) => ({
      id: String(e._id),
      email: e.email,
      createdAt: e.createdAt,
      addedByEmail: e.addedBy?.email ?? null,
    })),
  });
};

/**
 * POST /admin/collector-allowlist  { email }
 *
 * Upsert-with-resurrection: re-adding a previously removed email clears
 * removedAt and records the NEW granting admin, rather than colliding with
 * the unique index or resurrecting silently with stale attribution. The old
 * removal stays legible in updatedAt history; full audit of past cycles is
 * what removedBy/addedBy on the surviving row are for.
 */
exports.addToAllowlist = async (req, res) => {
  const email = normaliseEmail(req.body.email);
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    throw httpError(400, 'Provide a valid email address.');
  }

  const entry = await CollectorAllowlist.findOneAndUpdate(
    { email },
    {
      $set: { addedBy: req.admin._id, removedAt: null, removedBy: null },
      $setOnInsert: { email },
    },
    { new: true, upsert: true }
  ).lean();

  res.status(201).json({ entry });
};

/**
 * DELETE /admin/collector-allowlist/:email
 *
 * Soft-delete only — rows are never hard-deleted so the grant/revoke trail
 * survives. Effective immediately: googleAuthController consults isAllowed()
 * (which filters removedAt: null) on every sign-in.
 */
exports.removeFromAllowlist = async (req, res) => {
  const email = normaliseEmail(decodeURIComponent(req.params.email));

  const entry = await CollectorAllowlist.findOneAndUpdate(
    { email, removedAt: null },
    { $set: { removedAt: new Date(), removedBy: req.admin._id } },
    { new: true }
  ).lean();

  if (!entry) throw httpError(404, MSG_NO_ACTIVE_ENTRY, ErrorCodes.NOT_FOUND);
  res.json({ entry });
};

/**
 * POST /admin/consumer-links/unlink  { accountNumber? , userId?, reason }
 *
 * REST shape call: an action-style POST rather than DELETE /consumer-links/:id
 * because this is a dispute resolution act with a required audit payload, not
 * a resource deletion — callers address it by EITHER key without needing to
 * have first fetched a link id, and the request body carries the reason that
 * DELETE semantics would have nowhere to put.
 *
 * Soft-deletes matching ACTIVE links (removedAt / removedBy / removalReason),
 * preserving them as the audit record of who lost access to whose bills when
 * and why. After unlinking, the affected identity can only regain billing
 * access by claiming and verifying again from scratch.
 */
exports.unlinkConsumerLink = async (req, res) => {
  const { accountNumber, userId, reason } = req.body;

  if (!accountNumber && !userId) {
    throw httpError(400, MSG_LINK_TARGET_REQUIRED);
  }
  const trimmedReason = String(reason ?? '').trim();
  if (trimmedReason.length < 3) {
    // A dispute record without a usable reason defeats its own purpose.
    throw httpError(400, 'A reason for the unlink is required.');
  }

  const target = accountNumber ? { accountNumber: String(accountNumber).trim() } : { userId };
  const now = new Date();

  const result = await ConsumerLink.updateMany(
    { ...target, removedAt: null },
    {
      $set: {
        removedAt: now,
        removedBy: req.admin._id,
        removalReason: trimmedReason,
      },
    }
  );
  if (result.matchedCount === 0) {
    throw httpError(404, MSG_NO_ACTIVE_LINK, ErrorCodes.NOT_FOUND);
  }

  // Role demotion — the spec's "must re-claim" only works if claim-account's
  // role gate ('unclaimed') will admit them again. Demote each affected user
  // to 'unclaimed' ONLY if they hold no OTHER active link (a user may link
  // several accounts legitimately), and ONLY from 'consumer' — never clobber
  // a 'collector' standing granted via the allowlist.
  const affectedIds = accountNumber
    ? (
        await ConsumerLink.distinct('userId', {
          accountNumber: String(accountNumber).trim(),
          removedAt: now,
          removedBy: req.admin._id,
        })
      )
    : [userId];

  let usersResetToUnclaimed = 0;
  for (const id of affectedIds) {
    const remainingLinks = await ConsumerLink.countDocuments({ userId: id, removedAt: null });
    if (remainingLinks === 0) {
      const demoted = await GoogleUser.updateOne(
        { _id: id, role: 'consumer' },
        { $set: { role: 'unclaimed' } }
      );
      if (demoted.modifiedCount > 0) usersResetToUnclaimed += 1;
    }
  }

  console.warn(
    `[admin] Unlink: admin ${req.admin.email} removed ${result.modifiedCount} link(s) ` +
      `(${accountNumber ? `account ${target.accountNumber}` : `user ${userId}`}); reason: ${trimmedReason}`
  );

  res.json({
    unlinkedCount: result.modifiedCount,
    usersResetToUnclaimed,
  });
};
