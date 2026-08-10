/**
 * The portal's structured service address as one line.
 *
 * Empty parts are dropped rather than rendered as gaps — a stop printed as
 * "24 Mabini Street, , Tanauan City, " reads as a broken record, and a collector
 * cannot tell a missing barangay from a rendering bug.
 *
 * Shared rather than duplicated: the route list and the service-order list put the
 * same address in front of the same collector, and two copies of this is how one
 * screen starts printing a trailing comma the other does not.
 */
function formatAddress(address) {
  if (!address) return '';
  return [address.houseStreet, address.barangay, address.city, address.province]
    .map((part) => (part ? String(part).trim() : ''))
    .filter(Boolean)
    .join(', ');
}

module.exports = { formatAddress };
