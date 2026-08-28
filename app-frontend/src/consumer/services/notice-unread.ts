import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import EventSource from 'react-native-sse';

import { listNotices } from '@/consumer/services/consumer-data';
import type { Notice } from '@/consumer/types';
import { useIdentity } from '@/shared/auth/auth-context';
import { API_BASE_URL, authorizationHeader } from '@/shared/services/api-client';

/**
 * How many notices TWD has published that this consumer has not looked at yet.
 *
 * The Notices tab could only be discovered by tapping it. A service interruption
 * posted by the office at 8am is time-critical in exactly the way nothing else in
 * the consumer app is — "no water tomorrow, 9am–3pm" is useless news the day
 * after — and it sat behind a bell icon that looked identical whether the district
 * had posted nothing for a month or something urgent ten minutes ago.
 *
 * ⚠️ THIS IS NOT A PUSH NOTIFICATION, and the difference matters before anyone
 * relies on it. Nothing here wakes a closed app or lights up a lock screen; the
 * count is computed while the app is open and running. It is the badge on the tab,
 * not a knock on the door. A consumer who never opens the app learns nothing —
 * closing that gap needs a real push service and a device token, which is its own
 * piece of work and a server-side one.
 *
 * ## How it learns that something was published
 *
 * A live connection to `GET /announcements/stream`, which the backend holds open
 * and writes to the moment the portal publishes (app-backend/services/
 * noticeStream.js watches the collection the Admin Portal writes into). The event
 * carries no notice — it says "the feed changed" — and everything here responds by
 * re-reading the feed, so the list and the count always come from the one endpoint
 * that applies the audience rules.
 *
 * The timer below survives alongside it, deliberately, as the backstop: a stream
 * can be dead in ways neither end notices (a proxy buffering the response, a
 * backend deployed without the endpoint), and a badge whose only input is a
 * connection nobody is checking is a badge that silently stops working.
 *
 * ## What counts as unread
 *
 * A high-water mark, not a per-notice read flag. The app stores the publish time
 * of the newest notice the consumer has actually had on screen; anything published
 * after that is unread. That choice is deliberate:
 *
 *   • The server has no per-consumer read state for notices, and inventing one
 *     locally that pretends to be TWD's would be a claim the district cannot
 *     back up. `consumernotifications` — the addressed-message inbox that DOES
 *     track reads — is a different feed with a different audience (see
 *     consumer-data.listNotifications).
 *   • Notices are a broadcast feed read top-down. Nobody reads the third one and
 *     leaves the first two for later, so per-item state would be bookkeeping
 *     nobody asked for.
 *
 * The mark is a publish time rather than "the time I last looked", because those
 * two are not the same on a phone with a wrong clock, and the publish times are
 * the server's.
 */

/**
 * Cache key PREFIX; the owner is appended.
 *
 * Same rule as the collector profile cache, and for the same reason: this outlives
 * the session that wrote it, so a shared handset must not serve one household's
 * read state to the next person who signs in. The owner is the consumer's email —
 * it is what both identity systems can produce (a Google session carries nothing
 * else), and it is known without a round trip.
 */
const STORAGE_PREFIX = '@notices_seen_at';

/**
 * How often the badge re-checks with TWD while the app is open.
 *
 * Five minutes, and this is now a backstop rather than the mechanism — the live
 * stream is what makes a new notice appear in about a second. It stays because a
 * stream can fail silently at either end, and five minutes of staleness in that
 * case is a far better failure than a feature that quietly stopped.
 *
 * Cheap by construction — `GET /announcements` is the same request the Notices
 * screen already makes, so a poll that finds nothing costs one small JSON body.
 */
const POLL_MS = 5 * 60_000;

/**
 * How long the SSE client waits before redialling a dropped connection.
 *
 * Five seconds. A phone loses its connection constantly — a lift, a tunnel, wifi
 * handing over to cellular — so this fires far more often than any failure, and it
 * should be quick enough that the gap is not worth thinking about while being long
 * enough that a backend that is genuinely down is not being dialled continuously by
 * every handset in the district.
 */
const RECONNECT_MS = 5_000;

function storageKeyFor(owner: string): string {
  return `${STORAGE_PREFIX}:${owner}`;
}

/** Publish time in epoch ms. 0 for anything unparseable — see `countUnseen`. */
function publishedAt(notice: Notice): number {
  return Date.parse(notice.date) || 0;
}

/**
 * Notices published after the mark.
 *
 * A notice with an unparseable date contributes 0 and therefore never counts as
 * unread. That is the safe direction: the alternative is a malformed date badging
 * the tab forever, with nothing the consumer can tap to make it stop.
 */
function countUnseen(notices: Notice[], seenAt: number): number {
  return notices.filter((notice) => publishedAt(notice) > seenAt).length;
}

async function readSeenAt(owner: string): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(storageKeyFor(owner));
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    // A corrupt or unreadable mark reads as "seen nothing". The badge is then
    // wrong in the direction that shows the consumer their notices, and the
    // first visit to the tab fixes it permanently.
    return 0;
  }
}

type Listener = (count: number) => void;

/**
 * The count, and everyone currently drawing it.
 *
 * Module state rather than React context because the two components involved sit
 * on opposite sides of the tree: the badge is painted by the tab bar
 * (consumer-tabs) and cleared by a screen inside it (notices/index). A provider
 * wrapping both would have to live in the consumer layout and thread a setter
 * down through the tab navigator to a route it does not render directly.
 *
 * The same shape as api-client's session listeners, deliberately — this app
 * already has one way to publish a value from outside React, and a second
 * mechanism doing the same job is how the two drift.
 */
const listeners = new Set<Listener>();
let current = 0;

function publish(count: number): void {
  if (count === current) return;
  current = count;
  listeners.forEach((listener) => listener(count));
}

/** Screens that want to re-read the feed when it changes. */
const feedListeners = new Set<() => void>();

let source: EventSource<'notices-changed'> | null = null;
let connections = 0;
/** Guards against two `open` attempts racing while the header is being fetched. */
let opening = false;

/**
 * Open the stream, authenticated as the current session.
 *
 * The header is fetched per connection rather than once, because it can expire:
 * `authorizationHeader` refreshes a stale access token first, which is the whole
 * reason this cannot simply read the keychain. On a 401 — the token died while the
 * connection was open, and the client redialled with it — the socket is torn down
 * and rebuilt from scratch so the refresh actually happens. Redialling with the
 * same dead credential is a loop that looks like a working reconnect.
 */
function openStream(owner: string): void {
  if (source || opening) return;
  opening = true;

  void (async () => {
    try {
      const authorization = await authorizationHeader();
      // Released while we were awaiting the token — do not open a connection
      // nobody is listening to.
      if (connections === 0) return;

      const stream = new EventSource<'notices-changed'>(
        `${API_BASE_URL}/announcements/stream`,
        {
          headers: { Authorization: authorization },
          // No timeout: the whole point is a response that never ends. The
          // library's default is already 0; stating it stops a future default
          // from closing every connection after some number of seconds.
          timeout: 0,
          pollingInterval: RECONNECT_MS,
        }
      );

      stream.addEventListener('notices-changed', () => {
        void NoticeUnread.refresh(owner);
        feedListeners.forEach((listener) => listener());
      });

      stream.addEventListener('error', (event) => {
        if ('xhrStatus' in event && event.xhrStatus === 401) {
          // Rebuilt after a pause, not immediately. If the refreshed token is
          // still refused — a revoked session, a server that has changed its
          // mind — an immediate rebuild is an unthrottled loop hammering the
          // API. The delay matches the client's own reconnect interval, so a
          // genuine expiry costs one five-second gap.
          closeStream();
          setTimeout(() => {
            if (connections > 0) openStream(owner);
          }, RECONNECT_MS);
        }
        // Every other failure is the connection dropping, which the client
        // redials on its own. Nothing is reported to the consumer: the badge is
        // still correct as of the last poll, and a banner about a stream they
        // were never told about would be noise.
      });

      source = stream;
    } catch {
      // No session, or the token could not be refreshed. The five-minute poll
      // still runs, and the next connect attempt happens when the app returns to
      // the foreground.
    } finally {
      opening = false;
    }
  })();
}

function closeStream(): void {
  source?.removeAllEventListeners();
  source?.close();
  source = null;
}

let pollTimer: ReturnType<typeof setInterval> | null = null;
let appStateSubscription: { remove: () => void } | null = null;

/**
 * The timer and the resume check, started once for the whole app.
 *
 * Owned here rather than by the hook because the hook is mounted more than once —
 * the tab bar draws the badge and the Notices screen shows the same count in its
 * heading — and two components asking the same question should not produce two
 * timers asking the server.
 */
function startBackstop(owner: string): void {
  pollTimer ??= setInterval(() => void NoticeUnread.refresh(owner), POLL_MS);
  appStateSubscription ??= AppState.addEventListener('change', (status) => {
    if (status !== 'active') return;
    // A recount on resume, because the stream cannot be trusted across a suspend:
    // the OS tears down sockets in the background and the XHR underneath the
    // client can come back believing it is still connected. Reopening it is the
    // same reasoning — a connection that is quietly dead reports nothing.
    void NoticeUnread.refresh(owner);
    closeStream();
    openStream(owner);
  });
}

function stopBackstop(): void {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  appStateSubscription?.remove();
  appStateSubscription = null;
}

export const NoticeUnread = {
  /** The last count computed. Synchronous, for a first paint with no flash. */
  get count(): number {
    return current;
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  /**
   * Ask TWD what has been published and recount.
   *
   * A failure leaves the previous count exactly as it was. Zeroing the badge
   * because a request timed out would erase a real notice from view and read as
   * "nothing to see" — the app would be answering a question it just failed to
   * ask. Silent, too: this runs on a timer nobody started.
   */
  async refresh(owner: string): Promise<void> {
    try {
      const [notices, seenAt] = await Promise.all([listNotices(), readSeenAt(owner)]);
      publish(countUnseen(notices, seenAt));
    } catch {
      // Offline, or TWD unreachable. Keep what we last knew.
    }
  },

  /**
   * Record that these notices have been on screen, and clear the badge.
   *
   * Takes the list the screen actually rendered rather than reading the clock,
   * so the mark can never run ahead of what was shown. If a notice arrives
   * between the screen's fetch and this call, it stays unread — the consumer
   * has genuinely not seen it, and the badge coming back is correct.
   */
  async markSeen(owner: string, notices: Notice[]): Promise<void> {
    const newest = notices.reduce((latest, notice) => Math.max(latest, publishedAt(notice)), 0);
    if (newest === 0) {
      // Nothing published, or nothing datable. There is no mark to move and
      // nothing to badge.
      publish(0);
      return;
    }

    try {
      const seenAt = await readSeenAt(owner);
      // Never moves backwards. A refresh that returns a shorter list — the
      // office deleted the newest notice — must not un-see everything under it.
      if (newest > seenAt) {
        await AsyncStorage.setItem(storageKeyFor(owner), String(newest));
      }
    } catch {
      // The write failed, so the badge will come back on the next poll. Publish
      // zero anyway: the consumer IS looking at the notices right now, and a
      // badge over a screen they are reading is nonsense whatever storage did.
    }
    publish(0);
  },

  /**
   * Be told when the district publishes something, so a screen can re-read.
   *
   * Separate from `subscribe` above, which is about the number. The Notices screen
   * does not care what the count is — it is showing the list the count describes —
   * but it does need to know that the list it is showing is now out of date.
   */
  onFeedChanged(listener: () => void): () => void {
    feedListeners.add(listener);
    return () => {
      feedListeners.delete(listener);
    };
  },

  /**
   * Open the live connection. Idempotent — the second caller joins the first.
   *
   * Both the tab bar and the Notices screen want live updates and neither owns the
   * other, so this is reference-counted rather than owned by whichever mounted
   * first. Closing on the first `disconnect()` would cut the stream for the tab
   * badge every time the consumer navigated away from Notices.
   */
  connect(owner: string): () => void {
    connections += 1;
    if (connections === 1) {
      openStream(owner);
      startBackstop(owner);
    }

    let released = false;
    return () => {
      // Guarded: a cleanup that runs twice (React strict mode, a re-render race)
      // must not decrement a count it already gave back.
      if (released) return;
      released = true;
      connections -= 1;
      if (connections === 0) {
        closeStream();
        stopBackstop();
      }
    };
  },

  /** Drop the in-memory count when a session ends, so the next one starts clean. */
  reset(): void {
    publish(0);
  },
};

/**
 * The count, live, for whoever is signed in.
 *
 * Lives beside the store rather than in a hooks folder of its own: they are one
 * idea, and the hook is the only supported way to read the store from a component.
 *
 * Polls while the app is open and re-checks the moment it returns to the
 * foreground. That second trigger is the one that matters in practice — a phone
 * spends most of the day in a pocket, where the interval cannot run — and without
 * it someone reopening the app tomorrow would see yesterday's count for up to
 * five minutes.
 */
export function useUnreadNoticeCount(): number {
  const { email } = useIdentity();
  const [count, setCount] = useState(NoticeUnread.count);

  useEffect(() => {
    // Signed out, or an identity with no email to scope the read mark to. There
    // is nothing to count and nobody to count it for — drop the stored count so
    // the next session does not inherit it, and subscribe to nothing.
    if (!email) {
      NoticeUnread.reset();
      return;
    }

    const unsubscribe = NoticeUnread.subscribe(setCount);
    // Reference-counted: the live connection, the poll and the resume check are
    // started by whichever component mounts first and stopped when the last one
    // goes. Two mounted copies of this hook — the tab bar and the Notices heading
    // — must not mean two of everything.
    const release = NoticeUnread.connect(email);
    void NoticeUnread.refresh(email);

    return () => {
      unsubscribe();
      release();
    };
  }, [email]);

  // Reported as zero rather than as whatever the last session left in state:
  // `count` is only meaningful for the identity it was counted for.
  return email ? count : 0;
}
