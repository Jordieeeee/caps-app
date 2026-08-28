import AsyncStorage from '@react-native-async-storage/async-storage';

import { checkOnline } from '@/shared/hooks/use-connectivity';
import { apiFetch } from '@/shared/services/api-client';

/**
 * The collector's own employment record.
 *
 * Everything the app showed about a collector used to come from the session minted
 * at login — a name and whatever `routeIds` were on the document that morning. A
 * collector's refresh token lives up to ninety days (REFRESH_TTL_COLLECTOR_DAYS),
 * precisely so someone on a rural route never has to re-authenticate, which means
 * a session can be a quarter of a year old. A transfer to another zone, a new route
 * assignment, or a corrected employee ID would not appear until they signed out —
 * and signing out is the one thing a collector holding unsynced work must not do.
 *
 * So the Account screen reads GET /profile/collector, and caches it for the field:
 * an employment record is exactly the thing someone needs to show at a gate when a
 * consumer asks who they are, and gates are where there is no signal.
 *
 * The cache survives sign-out, exactly like the cached route does. That is the
 * offline-first bargain this module already makes — a handset that has to work
 * with no signal keeps what it was given — and singling out the collector's own
 * name for erasure while the district's entire customer list stays on the device
 * would be security theatre. If TWD ever wants a handset wiped on sign-out, both
 * caches go together, from one place.
 */

/**
 * Cache key PREFIX. The owner is appended, and that is not cosmetic.
 *
 * This was a single global '@collector_profile' holding whoever logged in last.
 * On a handset used by two collectors — a shared district phone, or a test
 * device — the second one saw the FIRST one's employment record: their name in
 * the header, their employee number, their routes on the home screen. It is how
 * an allowlisted Google collector opened the app and was greeted as "Angela".
 *
 * A cache that outlives the session that filled it must be keyed by whose it is.
 * The owner is the AUTH identity (password: collectors._id, google: the verified
 * email) rather than the profile's own id, because the key has to be known
 * BEFORE the profile is fetched — that first cache read is the whole point of
 * the cache, and on a cold offline start there is nothing else to key on.
 */
const STORAGE_PREFIX = '@collector_profile';

/**
 * How long a cached employment record is treated as current.
 *
 * The Account screen used to go to the network on mount AND again on focus, and
 * showed a skeleton until the first of those returned. That is the wrong trade for
 * this particular record twice over.
 *
 * It is wrong on speed: an unreachable server does not fail fast, it fails at the
 * platform's socket timeout, so a collector with no signal watched grey blocks for
 * the better part of a minute before the screen fell back to a copy that had been
 * sitting on the phone the whole time.
 *
 * It is wrong on the data too. An employment record changes when the office
 * changes it — a transfer, a route reassignment, a corrected employee number —
 * which happens on the scale of weeks. Re-asking every time a collector taps back
 * from the edit screen buys nothing and costs the wait above.
 *
 * Five minutes, then: short enough that a change made at the office this morning
 * is picked up when the collector next opens the screen, long enough that the
 * screen is instant for the whole of a normal visit. Pull-to-refresh passes
 * `force` and ignores this entirely — an explicit ask is always honoured.
 */
const STALE_MS = 5 * 60_000;

/** Pre-scoping key. Read by nobody now; cleared on the next successful write. */
const LEGACY_STORAGE_KEY = '@collector_profile';

function storageKeyFor(owner: string): string {
  return `${STORAGE_PREFIX}:${owner}`;
}

async function writeCache(owner: string, profile: CollectorProfile): Promise<void> {
  try {
    const cached: CachedProfile = { profile, fetchedAt: Date.now() };
    await AsyncStorage.setItem(storageKeyFor(owner), JSON.stringify(cached));
    // Drop the unscoped blob so a stale foreign profile cannot resurface if a
    // future read ever falls back to it.
    await AsyncStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // A cache write failure costs the next offline open, not this read.
  }
}

export interface CollectorServiceRecord {
  /**
   * Meter readings TWD has received from this collector, ever.
   *
   * The only figure here, on purpose. It sat beside a count of payments received,
   * which was structurally always zero — collectors read meters and do not take
   * money — and a zero next to a real number reads as a collector who has never
   * done half their job.
   */
  readingsSubmitted: number;
}

export interface CollectorProfile {
  id: string;
  name: string | null;
  employeeId: string | null;
  email: string | null;
  phone: string | null;
  /** Display-only area label, e.g. "Zone 1 - Poblacion". Never an identifier. */
  zone: string | null;
  routeIds: string[];
  status: 'active' | 'disabled';
  /** `YYYY-MM-DD`. A calendar fact with no time and no timezone. */
  dateHired: string | null;
  /** ISO 8601 — when TWD created the record. */
  memberSince: string | null;
  service: CollectorServiceRecord;
}

/**
 * A profile plus how old it is.
 *
 * `fromCache` is not a diagnostic. A service record read off the phone is a claim
 * about what TWD held the last time this phone could ask, and the screen has to be
 * able to say so rather than presenting Tuesday's totals as today's.
 */
export interface CollectorProfileSnapshot {
  profile: CollectorProfile;
  fromCache: boolean;
  /** Epoch ms of the read this profile came from. */
  fetchedAt: number | null;
  /**
   * Whether TWD was asked for a fresh copy and could not be reached.
   *
   * Distinct from `fromCache`, which is now also true in the ordinary case where
   * the record was recent enough that we did not ask at all. Collapsing the two
   * would put "Could not reach TWD" on a screen that never tried — the same class
   * of false claim the sync screen exists to avoid. Same split as RouteSnapshot.
   */
  pullFailed: boolean;
}

interface CachedProfile {
  profile: CollectorProfile;
  fetchedAt: number;
}

export class CollectorProfileService {
  /** GET /profile/collector. Token-scoped — there is no way to name another collector. */
  static async pull(owner: string): Promise<CollectorProfile> {
    const { profile } = await apiFetch<{ profile: CollectorProfile }>('/profile/collector');
    await writeCache(owner, profile);
    return profile;
  }

  /**
   * PATCH /profile/collector — the contact number, and nothing else.
   *
   * Deliberately not offline-queued. Every other write in this module (readings,
   * collections) goes through the outbox because it is field work that cannot be
   * re-done — the collector has walked away from the meter. A phone number is the
   * opposite: it is not time-critical, it is trivially re-entered, and queueing it
   * would mean the screen showing a new number that TWD does not have and cannot
   * be told about until signal returns. Failing loudly and keeping the old value is
   * the honest outcome.
   *
   * Returns the profile the server ended up with rather than assuming the request
   * body became the truth: the server normalises `0917 123 4567` to `09171234567`,
   * so echoing back what was typed would leave the screen showing something the
   * district did not save.
   */
  static async update(owner: string, edit: { phone: string }): Promise<CollectorProfile> {
    const { profile } = await apiFetch<{ profile: CollectorProfile }>('/profile/collector', {
      method: 'PATCH',
      body: JSON.stringify(edit),
    });
    await writeCache(owner, profile);
    return profile;
  }

  static async getCached(owner: string): Promise<CachedProfile | null> {
    try {
      const raw = await AsyncStorage.getItem(storageKeyFor(owner));
      if (raw) return JSON.parse(raw) as CachedProfile;
    } catch {
      // Corrupt cache reads as no cache.
    }
    return null;
  }

  /**
   * The record: from the phone when the phone's copy will do, from TWD otherwise.
   *
   * Cache first, deliberately. The old order was network-then-cache, which meant
   * every open paid for a round trip before it could draw anything it already had.
   * See STALE_MS.
   *
   * Two shortcuts, both of which end in an immediate return:
   *
   *   • A copy read less than STALE_MS ago is the answer. Nothing is asked for.
   *   • Known-offline with any copy at all. `checkOnline` is a NetInfo read, not a
   *     round trip, so this costs nothing and saves the full socket timeout —
   *     which is the difference between a screen that draws and one that appears
   *     to hang at exactly the moment a collector is standing at a gate being
   *     asked who they are.
   *
   * Throws only when there is no copy AND the pull failed — the one case where the
   * screen genuinely has nothing to show, and which must not be dressed up as an
   * empty profile.
   */
  static async load(
    owner: string,
    { force = false }: { force?: boolean } = {}
  ): Promise<CollectorProfileSnapshot> {
    const cached = await this.getCached(owner);

    if (cached && !force && Date.now() - cached.fetchedAt < STALE_MS) {
      return {
        profile: cached.profile,
        fromCache: true,
        fetchedAt: cached.fetchedAt,
        pullFailed: false,
      };
    }

    if (cached && !(await checkOnline())) {
      return {
        profile: cached.profile,
        fromCache: true,
        fetchedAt: cached.fetchedAt,
        pullFailed: true,
      };
    }

    try {
      const profile = await this.pull(owner);
      return { profile, fromCache: false, fetchedAt: Date.now(), pullFailed: false };
    } catch (error) {
      if (!cached) throw error;
      return {
        profile: cached.profile,
        fromCache: true,
        fetchedAt: cached.fetchedAt,
        pullFailed: true,
      };
    }
  }
}
