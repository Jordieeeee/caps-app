/**
 * Date formatting for server-issued ISO timestamps.
 *
 * The API returns full ISO 8601 (`2026-07-31T00:00:00.000Z`) since the switch to
 * the portal's real `bills` and `cmscontents`, where dates are Date values rather
 * than the `YYYY-MM-DD` strings the mock used. Rendering those raw put a machine
 * timestamp in front of a consumer, so every date goes through here.
 *
 * Dates are read in UTC on purpose. A due date is a calendar day the district
 * decided, not an instant: parsing `2026-07-31T00:00:00.000Z` in Manila time (UTC+8)
 * and formatting it locally is safe, but the same value in any negative-offset
 * timezone renders as the 30th. The bill is due on the 31st in Tanauan regardless of
 * where the phone thinks it is.
 */

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** `31 Jul 2026`. Empty string for a missing or unparseable date. */
export function formatDate(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * `July 2026` from a billing period.
 *
 * The portal stores periods as `2026-07`. The mock used prose ("June 2025"), so
 * screens rendered the field directly; an unrecognised value is passed through
 * unchanged rather than blanked, so a format change upstream degrades to showing
 * the raw period instead of showing nothing.
 */
const FULL_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function formatBillingPeriod(period: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) return period;
  const month = FULL_MONTHS[Number(match[2]) - 1];
  return month ? `${month} ${match[1]}` : period;
}

/**
 * Today, as the calendar on the wall in Tanauan has it: `YYYY-MM-DD`, local.
 *
 * ⚠️ NOT `new Date().toISOString().split('T')[0]`, which is what four call sites
 * used to do and is wrong here by a whole day for part of every day. `toISOString`
 * converts to UTC first, and Manila is UTC+8: at 07:00 on 1 August a collector's
 * phone reports `2026-07-31`. Meter readers start before eight. So a reading taken
 * on the first morning of the month was stamped into the *previous* month, which
 * put it in the wrong billing period, under the wrong "today" on the Daily Summary,
 * and left its route row showing "Unread" for the meter that had just been read.
 *
 * The failure is silent and time-of-day dependent, which is why it survived: it is
 * correct all afternoon, and correct all day for anyone testing west of Greenwich.
 *
 * Every date this app *stamps on a record* goes through here, and every date it
 * *compares against* has to as well — a mixed pair reintroduces the bug at the
 * boundary. Dates that arrive from the server are a different thing entirely and
 * stay on `formatDate`, which reads them in UTC on purpose (see the note at the top
 * of this file): a due date the district decided is not a local instant.
 */
export function localDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** The `YYYY-MM` a `YYYY-MM-DD` key belongs to. String work — no reparsing, no drift. */
export function monthKeyOf(dateKey: string): string {
  return dateKey.slice(0, 7);
}
