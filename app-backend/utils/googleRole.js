const CollectorAllowlist = require('../models/CollectorAllowlist');

/**
 * What role a Google identity holds RIGHT NOW.
 *
 * There are two doors into a Google-flow session — the Google callback, and the
 * password a consumer or collector set on themselves
 * (models/MobileCredential.js) — and both have to answer this question the same
 * way. They did not, at first: the password path read `google_users.role` off the
 * row, which is correct for a consumer and silently wrong for a collector.
 *
 * ⚠️ A COLLECTOR'S ROLE IS NOT ON THE ROW. `googleAuthController` grants it per
 * session from the allowlist and deliberately leaves `users.role` alone, precisely
 * so removing an email from the allowlist demotes that person on their next
 * sign-in with no migration. Reading the row instead would have meant an
 * ex-collector kept collector sessions through the password door forever — the one
 * revocation mechanism the district has, bypassed by the newer of the two logins.
 *
 * So it lives here, once, and both callers use it.
 */
async function resolveGoogleRole(user) {
  const email = String(user.email ?? '').toLowerCase().trim();
  // Allowlist membership grants collector standing on THIS SESSION only, read
  // fresh every time. The stored role is the fallback, never an override.
  if (email && (await CollectorAllowlist.isAllowed(email))) return 'collector';
  return user.role;
}

module.exports = { resolveGoogleRole };
