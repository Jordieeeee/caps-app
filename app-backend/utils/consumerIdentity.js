/**
 * How a consumer's name is assembled from the Admin Portal's registry fields.
 *
 * The portal stores no `name`. An individual is `firstName`/`middleName`/
 * `lastName`; a business is `businessName` with a `contactPersonName` beside it.
 * Only self-registered mobile consumers carry a flat `name`, so every read path
 * has to cope with all three shapes — which is why this is one function rather
 * than the same conditional copied into the model's toJSON and the profile
 * presenter, where the two could disagree about what a business is called.
 */
function displayName(raw) {
  if (!raw) return undefined;
  if (raw.name) return raw.name;

  return (
    raw.businessName ||
    raw.contactPersonName ||
    [raw.firstName, raw.middleName, raw.lastName].filter(Boolean).join(' ') ||
    undefined
  );
}

/**
 * The phone number to show, out of the portal's `contacts` array.
 *
 * Prefers the entry flagged primary, then any mobile, then whatever exists. The
 * fallback chain matters because `isPrimary` is the portal's field and nothing
 * guarantees a record has one set — returning null there would tell a consumer
 * the district holds no number for them while a perfectly good one sat in slot 0.
 */
function primaryContact(contacts) {
  if (!Array.isArray(contacts) || contacts.length === 0) return null;

  const found =
    contacts.find((c) => c && c.isPrimary) ||
    contacts.find((c) => c && c.contactType === 'mobile') ||
    contacts[0];

  return found && found.value ? found : null;
}

module.exports = { displayName, primaryContact };
