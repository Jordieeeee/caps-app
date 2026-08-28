/**
 * What makes a password acceptable when someone SETS one.
 *
 * Mirrors app-frontend/src/shared/auth/password-policy.ts, which draws the same
 * rules as a live checklist while they type. The client copy exists to answer
 * without a round trip; this one is the gate. Keep the two in step — a client that
 * ticks every box and a server that then refuses the password is the worst version
 * of this feature, because the person has no way to find out what is wrong.
 *
 * Three rules: length, a letter, a digit. Deliberately short of the usual
 * composition zoo, for the reasoning in the client file — length is what carries
 * the strength, and the other two exist to rule out `12345678` and `password`.
 *
 * ⚠️ CHECKED ON SET, NEVER ON USE. `authenticate` does not consult this, so
 * tightening these rules can never lock anyone out of an account they already
 * have; it only applies to the next password they choose.
 */

const MIN_PASSWORD_LENGTH = 8;

const RULES = [
  {
    label: `at least ${MIN_PASSWORD_LENGTH} characters`,
    test: (password) => password.length >= MIN_PASSWORD_LENGTH,
  },
  // `\p{L}`, not `[a-z]`: a password is not required to be English.
  { label: 'a letter', test: (password) => /\p{L}/u.test(password) },
  { label: 'a number', test: (password) => /\d/.test(password) },
];

/**
 * The complaint, or null when the password is acceptable.
 *
 * Names everything missing in one sentence rather than the first failure alone.
 * Reporting one rule at a time turns choosing a password into a series of
 * rejections, each of which looks like the last one was accepted.
 */
function passwordProblem(password) {
  const value = String(password ?? '');
  const missing = RULES.filter((rule) => !rule.test(value)).map((rule) => rule.label);
  if (missing.length === 0) return null;
  return `Your password needs: ${missing.join(', ')}.`;
}

module.exports = { MIN_PASSWORD_LENGTH, passwordProblem };
