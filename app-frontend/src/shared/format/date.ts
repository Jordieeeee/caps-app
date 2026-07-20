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
