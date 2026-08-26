/**
 * Philippine mobile numbers, normalised to the 09XXXXXXXXX form already in the
 * registry.
 *
 * Accepts the +63 form too, because that is what a phone's own contact card
 * produces and rejecting it would look like the app disliking the user's real
 * number. Spaces, dashes and parentheses are stripped before matching rather than
 * rejected — someone typing `0912 345 6789` has not made a mistake.
 *
 * Lifted out of profileController.js when the collector profile grew an editable
 * phone of its own: two copies of this would be two opinions about what a valid
 * number is, and the one that drifts is the one that starts storing a format the
 * portal's SMS gateway cannot dial.
 *
 * @returns {string|null} The normalised number, or null if it is not one.
 */
function normaliseMobile(raw) {
  const digits = String(raw).replace(/[\s()-]/g, '');

  if (/^09\d{9}$/.test(digits)) return digits;
  if (/^\+639\d{9}$/.test(digits)) return `0${digits.slice(3)}`;
  if (/^639\d{9}$/.test(digits)) return `0${digits.slice(2)}`;

  return null;
}

/** The one wording used wherever a number is rejected, in both modules. */
const INVALID_MOBILE_MESSAGE =
  'Enter a valid Philippine mobile number, for example 09171234567.';

/**
 * What the claim/verify flow shows the user instead of the number the OTP was
 * sent to — enough to recognise the SIM ("…ends 1234"), not enough to confirm
 * a stranger's guess about whose number is on file. Runs normaliseMobile
 * internally so both stored (+63…) and typed (09…) forms mask identically.
 *
 * @returns {string|null} e.g. "09XX-XXX-1234", or null if not a mobile.
 */
function maskMobile(raw) {
  const digits = normaliseMobile(raw);
  if (!digits) return null;
  return `${digits.slice(0, 2)}XX-XXX-${digits.slice(-4)}`;
}

module.exports = { normaliseMobile, INVALID_MOBILE_MESSAGE, maskMobile };
