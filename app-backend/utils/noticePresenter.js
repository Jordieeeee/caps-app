/**
 * Turning a `cmscontents` document into the notice the mobile app renders.
 *
 * Lifted out of announcementController when the live stream arrived: two callers
 * now answer "what does this notice look like to a consumer?" — the list endpoint
 * and the change-stream fan-out (services/noticeStream.js) — and a second copy of
 * these maps is a guarantee that a notice pushed live eventually stops matching the
 * same notice fetched a second later.
 */

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

/**
 * The Google flow's roles are lowercase ('consumer'/'collector') while the
 * password flow's are capitalised. Normalised in one place rather than teaching
 * every audience helper about two role systems.
 */
const GOOGLE_ROLE_ALIASES = { consumer: 'Consumer', collector: 'Collector' };

/** The audience bucket a caller belongs to, from their verified role claim. */
function audienceFor(role) {
  const normalised = GOOGLE_ROLE_ALIASES[role] ?? role;
  if (normalised === 'Consumer') return 'consumers';
  if (normalised === 'Collector') return 'collectors';
  return 'all';
}

/**
 * Whether a document is one this audience may see.
 *
 * The same two gates `Announcement.listPublishedFor` applies as a query, expressed
 * for a single document because the change stream hands us one at a time and there
 * is no query to hang them on. They must stay in step: a draft or another
 * audience's notice leaking through here would be published by the push that the
 * list endpoint then refuses to confirm.
 */
function isVisibleTo(doc, audience) {
  if (!doc || doc.status !== 'published') return false;
  return doc.targetAudience === audience || doc.targetAudience === 'all';
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
    date: new Date(doc.publishedAt || doc.createdAt).toISOString(),
  };
}

module.exports = { audienceFor, isVisibleTo, present };
