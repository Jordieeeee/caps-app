const Announcement = require('../models/Announcement');
const { isVisibleTo, present } = require('../utils/noticePresenter');

/**
 * Push published notices to open apps the moment the portal publishes them.
 *
 * The mobile app polled `GET /announcements` on a timer, which is fine for a feed
 * of routine updates and wrong for the one thing this feed is actually for: "no
 * water tomorrow, 9am–3pm" posted at 8am is worth minutes, and a consumer who
 * happens to be holding the phone should see it now rather than at the top of the
 * next poll.
 *
 * ## Why a change stream and not an in-process event
 *
 * Nothing in THIS backend publishes a notice. The Admin Portal is a separate
 * application that writes straight into the same MongoDB `cmscontents` collection
 * (see models/Announcement.js — this backend is a read-only consumer of it), so no
 * emitter here can ever see the write. The database is the only place the two
 * applications meet, and a change stream is how it says what just happened.
 *
 * ## One stream, many subscribers
 *
 * A single `watch()` for the whole process, fanned out to connected clients. Per-
 * connection change streams would open one Mongo cursor per phone, which is a way
 * to take a district's worth of consumers and turn it into a district's worth of
 * cursors against Atlas.
 *
 * ## Not a push notification
 *
 * This reaches apps that are OPEN. It cannot wake a closed app or light a lock
 * screen — that needs APNs/FCM and a device token, which is separate work. See the
 * same warning in app-frontend/src/consumer/services/notice-unread.ts.
 */

/** Connected clients: { res, audience, heartbeat }. */
const subscribers = new Set();

/** Keeps proxies and mobile NATs from closing an idle connection. */
const HEARTBEAT_MS = 25_000;

/**
 * How long to wait before reopening a change stream that died.
 *
 * Backs off to a minute. A change stream ends for two very different reasons — a
 * blip in the connection to Atlas, or a deployment that does not support them at
 * all — and reconnecting every second is only reasonable for the first.
 */
const RETRY_MS = [1_000, 5_000, 15_000, 60_000];

let stream = null;
let retries = 0;
let retryTimer = null;
/** Set when change streams turn out not to be available at all — see `start`. */
let pollTimer = null;
let lastSeenPublishedAt = null;

function log(message) {
  // eslint-disable-next-line no-console -- server-side operational logging
  console.log(`[notice-stream] ${message}`);
}

/**
 * Tell every subscriber whose audience matches that the feed has changed.
 *
 * The event carries the notice's id and publish time and NOT the notice itself.
 * That is deliberate: the app re-reads `GET /announcements` when it arrives, so the
 * list it renders always came from one place. Pushing the document instead would
 * give the client two ways to learn what a notice says — a fetched one and a
 * streamed one — and the day they disagree is the day the screen shows a title
 * that no longer exists.
 */
function fanOut(doc) {
  const notice = present(doc);
  const payload = JSON.stringify({ id: notice.id, publishedAt: notice.date });

  for (const subscriber of subscribers) {
    if (!isVisibleTo(doc, subscriber.audience)) continue;
    try {
      subscriber.res.write(`event: notices-changed\ndata: ${payload}\n\n`);
    } catch {
      // A dead socket that has not fired 'close' yet. The close handler removes
      // it; failing to write to one client must not stop the others.
    }
  }
}

/** Newest publish time currently in the collection, or null when there is none. */
async function newestPublishedAt() {
  const [newest] = await Announcement.find({ status: 'published' })
    .sort({ publishedAt: -1 })
    .limit(1)
    .lean();
  if (!newest) return null;
  return new Date(newest.publishedAt || newest.createdAt).getTime();
}

/**
 * Last-resort fallback: ask the database on a timer.
 *
 * Change streams need a replica set. Production is Atlas, which is one, but a
 * developer running a standalone `mongod` is not — and without this the feature
 * would be silently dead there while looking fine in the code. Fifteen seconds is
 * far worse than a change stream and far better than nothing, and the client
 * cannot tell the difference: it receives the same event either way.
 */
function startFallbackPolling() {
  if (pollTimer) return;
  log('change streams unavailable — falling back to polling every 15s');

  pollTimer = setInterval(async () => {
    try {
      const newest = await newestPublishedAt();
      if (newest === null || newest === lastSeenPublishedAt) return;
      // First run after startup establishes the baseline rather than announcing
      // everything that was already there.
      const isFirstObservation = lastSeenPublishedAt === null;
      lastSeenPublishedAt = newest;
      if (isFirstObservation) return;

      const [doc] = await Announcement.find({ status: 'published' })
        .sort({ publishedAt: -1 })
        .limit(1)
        .lean();
      if (doc) fanOut(doc);
    } catch {
      // The database is unreachable. The next tick tries again; subscribers keep
      // their connections and their last known list.
    }
  }, 15_000);
  pollTimer.unref?.();
}

function scheduleRetry() {
  if (retryTimer) return;
  const delay = RETRY_MS[Math.min(retries, RETRY_MS.length - 1)];
  retries += 1;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    start();
  }, delay);
  retryTimer.unref?.();
}

/**
 * Open the change stream. Safe to call repeatedly.
 *
 * `fullDocument: 'updateLookup'` is required, not a nicety: an update event
 * otherwise carries only the changed fields, and the audience and status gates
 * need the whole document to decide who may see it. Publishing a draft is an
 * update, so this is the commonest event of all.
 */
function start() {
  if (stream || pollTimer) return;

  try {
    stream = Announcement.watch(
      [
        {
          $match: {
            operationType: { $in: ['insert', 'update', 'replace'] },
          },
        },
      ],
      { fullDocument: 'updateLookup' }
    );

    stream.on('change', (change) => {
      retries = 0;
      const doc = change.fullDocument;
      // Deletes and drafts reach here too. Only a published document is news;
      // a notice being withdrawn is picked up by the next ordinary fetch.
      if (doc && doc.status === 'published') fanOut(doc);
    });

    stream.on('error', (error) => {
      log(`change stream error: ${error.message}`);
      void stream?.close().catch(() => {});
      stream = null;
      // A replica-set-less deployment reports this on the first event or
      // immediately; either way retrying forever would never succeed, so the
      // last backoff step hands over to polling.
      if (retries >= RETRY_MS.length) startFallbackPolling();
      else scheduleRetry();
    });

    stream.on('close', () => {
      stream = null;
      if (!pollTimer) scheduleRetry();
    });

    log('watching cmscontents for published notices');
  } catch (error) {
    log(`could not open change stream: ${error.message}`);
    stream = null;
    startFallbackPolling();
  }
}

/**
 * Register an open SSE response.
 *
 * The heartbeat is a comment line, which every SSE parser ignores. Without it a
 * connection that carries no notices for an hour — the normal case — is closed by
 * something in the middle, and the client only finds out when it tries to read.
 */
function subscribe(res, audience) {
  const subscriber = { res, audience, heartbeat: null };

  subscriber.heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      // Handled by the close listener below.
    }
  }, HEARTBEAT_MS);
  subscriber.heartbeat.unref?.();

  subscribers.add(subscriber);
  start();

  return () => {
    clearInterval(subscriber.heartbeat);
    subscribers.delete(subscriber);
  };
}

/** Open connections, for diagnostics. */
function subscriberCount() {
  return subscribers.size;
}

module.exports = { subscribe, subscriberCount };
