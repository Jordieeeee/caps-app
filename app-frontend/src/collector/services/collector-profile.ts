import AsyncStorage from '@react-native-async-storage/async-storage';

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

const STORAGE_KEY = '@collector_profile';

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
}

interface CachedProfile {
  profile: CollectorProfile;
  fetchedAt: number;
}

export class CollectorProfileService {
  /** GET /profile/collector. Token-scoped — there is no way to name another collector. */
  static async pull(): Promise<CollectorProfile> {
    const { profile } = await apiFetch<{ profile: CollectorProfile }>('/profile/collector');

    try {
      const cached: CachedProfile = { profile, fetchedAt: Date.now() };
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
    } catch {
      // A cache write failure costs the next offline open, not this read.
    }

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
  static async update(edit: { phone: string }): Promise<CollectorProfile> {
    const { profile } = await apiFetch<{ profile: CollectorProfile }>('/profile/collector', {
      method: 'PATCH',
      body: JSON.stringify(edit),
    });

    try {
      const cached: CachedProfile = { profile, fetchedAt: Date.now() };
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
    } catch {
      // See pull(): a failed cache write costs the next offline open, not this save.
    }

    return profile;
  }

  static async getCached(): Promise<CachedProfile | null> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw) as CachedProfile;
    } catch {
      // Corrupt cache reads as no cache.
    }
    return null;
  }

  /**
   * The record, live if possible and saved if not.
   *
   * Throws only when both fail — an unreachable server with nothing cached is the
   * one case where the screen genuinely has nothing to show, and it must not be
   * dressed up as an empty profile.
   */
  static async load(): Promise<CollectorProfileSnapshot> {
    try {
      const profile = await this.pull();
      return { profile, fromCache: false, fetchedAt: Date.now() };
    } catch (error) {
      const cached = await this.getCached();
      if (!cached) throw error;
      return { profile: cached.profile, fromCache: true, fetchedAt: cached.fetchedAt };
    }
  }
}
