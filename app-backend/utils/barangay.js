/**
 * Which barangay an account sits in.
 *
 * There is no `barangay` column on `Account` — it carries one free-text `address`
 * line. The portal holds the structured value in two places, and they answer two
 * different questions:
 *
 *   1. `ServiceConnection.serviceAddress.barangay` — where the METER is.
 *   2. `Consumer.mailingAddress.barangay` — where the BILL goes.
 *
 * A collector walks to the meter, so (1) wins whenever it exists. For most
 * households the two agree; for a landlord, a business billed at a head office, or
 * anyone billed care-of a relative they do not, and preferring the billing address
 * would send someone to the wrong barangay from a screen that looks entirely
 * consistent.
 *
 * The address line is last because parsing prose is a guess, and a failed guess
 * resolves to `Unassigned` rather than to an invented name. A route that silently
 * files a household under the wrong barangay sends a collector across the city;
 * one that says "Unassigned" sends them to the office to get the record fixed.
 */

/**
 * `Brgy. Poblacion 3` / `Barangay Darasa` — the marker plus everything up to the
 * next comma. Anchored on the marker rather than on position, because the segment
 * index is not stable: `24 Mabini Street, Brgy. Poblacion 3, Tanauan City` and
 * `Brgy. Darasa, Tanauan City` put it in different slots.
 */
const BARANGAY_IN_ADDRESS = /(?:brgy\.?|barangay)\s+([^,]+)/i;

const UNASSIGNED = 'Unassigned';

function clean(value) {
  return String(value).replace(/\s+/g, ' ').trim();
}

/**
 * @param {object} sources
 * @param {{ barangay?: string }} [sources.serviceAddress] Where the meter is.
 * @param {{ barangay?: string }} [sources.mailingAddress] Where the bill goes.
 * @param {string} [sources.address] The account's free-text address line.
 * @returns {string} A barangay name, or `Unassigned` when no source holds one.
 */
function barangayOf({ serviceAddress, mailingAddress, address } = {}) {
  for (const structured of [serviceAddress, mailingAddress]) {
    const value = structured && structured.barangay;
    if (value && clean(value)) return clean(value);
  }

  const match = BARANGAY_IN_ADDRESS.exec(address || '');
  if (match && clean(match[1])) return clean(match[1]);

  return UNASSIGNED;
}

/**
 * Barangay names with how many accounts each holds, for a filter row.
 *
 * Counted server-side because the client filters a *paged-in-future* list: the
 * count has to describe the district's data, not the subset that happens to be on
 * the phone, or a collector clearing a filter would watch the numbers change.
 *
 * `Unassigned` sorts last however many there are — it is not a place, and putting
 * it between "Trapiche" and "Ulango" implies it is one.
 */
function summarise(rows) {
  const counts = new Map();
  for (const row of rows) counts.set(row.barangay, (counts.get(row.barangay) || 0) + 1);

  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => {
      if (a.name === UNASSIGNED) return 1;
      if (b.name === UNASSIGNED) return -1;
      return a.name.localeCompare(b.name);
    });
}

module.exports = { barangayOf, summarise, UNASSIGNED };
