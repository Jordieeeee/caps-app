const Announcement = require('../models/Announcement');
const httpError = require('../utils/httpError');
const ErrorCodes = require('../utils/errorCodes');

/** Portal category → the client's NoticeType union (shared/components/status-badge). */
const TYPE_BY_CATEGORY = {
  service_interruption: 'interruption',
  advisory: 'advisory',
  update: 'service-update',
};

/**
 * The UI renders a priority badge; `cmscontents` has no priority field.
 *
 * Rather than invent a per-notice priority the portal never set, priority is
 * derived from category: an interruption cuts someone's water off and outranks an
 * advisory, which outranks an informational update. This is a *presentation* rule,
 * not data — it is uniform across every notice in a category.
 *
 * ⚠️ ASSUMPTION, pending district confirmation. If TWD wants a high-priority
 * advisory to outrank a routine interruption, priority has to become a real field
 * an editor sets in the portal, and this map goes away.
 */
const PRIORITY_BY_CATEGORY = {
  service_interruption: 'high',
  advisory: 'medium',
  update: 'low',
};

/** The audience bucket a caller belongs to, from their verified role claim. */
function audienceFor(role) {
  if (role === 'Consumer') return 'consumers';
  if (role === 'Collector') return 'collectors';
  return 'all';
}

function present(doc) {
  return {
    id: String(doc._id),
    title: doc.title,
    type: TYPE_BY_CATEGORY[doc.category] || 'service-update',
    priority: PRIORITY_BY_CATEGORY[doc.category] || 'low',
    content: doc.body,
    // publishedAt is set when the portal publishes; status:'published' is the gate,
    // so a published doc without a timestamp is a portal-side anomaly rather than a
    // normal state. Fall back to createdAt so it still sorts and renders.
    date: (doc.publishedAt || doc.createdAt).toISOString(),
  };
}

/**
 * Published notices for the caller's audience.
 *
 * The audience comes from the token's role claim, never from a query parameter —
 * otherwise any consumer could request `?audience=collectors` and read the
 * district's internal operational notices.
 */
exports.list = async (req, res) => {
  // The Google flow's roles are lowercase ('consumer'/'collector') while
  // audienceFor speaks the password system's capitalised vocabulary. Normalise
  // rather than teach every audience helper about two role systems.
  const GOOGLE_ROLE_ALIASES = { consumer: 'Consumer', collector: 'Collector' };
  const role = GOOGLE_ROLE_ALIASES[req.user.role] ?? req.user.role;
  const notices = await Announcement.listPublishedFor(audienceFor(role));
  res.json({ announcements: notices.map(present) });
};

/** Publishing is an Admin Portal function; this backend only reads `cmscontents`. */
exports.create = async (req, res) => {
  throw httpError(
    410,
    'Notices are published from the TWD Admin Portal. This endpoint no longer accepts writes.',
    ErrorCodes.NOT_SUPPORTED
  );
};
