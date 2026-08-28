/**
 * The one password rule set, for every screen that asks for one.
 *
 * It began as a private `MIN_PASSWORD_LENGTH = 8` inside enroll-screen.tsx, which
 * was fine while enrolment was the only place a password was chosen. It is not any
 * more (see consumer/account/set-password.tsx), and a second copy of a rule is a
 * rule that eventually disagrees with itself — one screen accepting what the other
 * rejects, for the same account.
 *
 * Mirrored server-side in app-backend/utils/passwordPolicy.js. The client copy
 * exists to answer *while someone types*, not instead of the server: the server
 * enforces this independently and is the only gate that counts.
 *
 * ## Why these three and not more
 *
 * Length, a letter, a digit. Deliberately short of the usual composition zoo
 * (uppercase, symbol, no-repeats), because this app is used by a whole city's
 * households across every level of confidence with phones, and each extra rule
 * buys less entropy than it costs in passwords written on the back of a bill.
 * Length is the rule that actually carries the strength; the other two exist to
 * rule out `12345678` and `password`, which is most of the real-world benefit of
 * composition rules and none of the cruelty.
 *
 * ⚠️ Rules are checked when a password is SET, never when one is used. Changing
 * this list cannot lock anyone out of an account they already have.
 */

/** Minimum length. The rule that does the actual work. */
export const MIN_PASSWORD_LENGTH = 8;

export interface PasswordRule {
  id: string;
  /**
   * Phrased as the finished state, not as an instruction — "At least 8
   * characters", not "Use at least 8 characters". The list is a checklist being
   * ticked off, and an imperative reads as nagging once it has been satisfied.
   */
  label: string;
  test: (password: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  {
    id: 'length',
    label: `At least ${MIN_PASSWORD_LENGTH} characters`,
    test: (password) => password.length >= MIN_PASSWORD_LENGTH,
  },
  {
    id: 'letter',
    label: 'Contains a letter',
    // Any script's letters, not just A–Z — `\p{L}` with the `u` flag. A password
    // is not required to be English.
    test: (password) => /\p{L}/u.test(password),
  },
  {
    id: 'digit',
    label: 'Contains a number',
    test: (password) => /\d/.test(password),
  },
];

/** Which rules this password does not yet meet. Empty means it is acceptable. */
export function unmetRules(password: string): PasswordRule[] {
  return PASSWORD_RULES.filter((rule) => !rule.test(password));
}

/**
 * One sentence naming everything still missing, or null when the password passes.
 *
 * For the submit path, where a single field-level error has to say what is wrong.
 * The live checklist is the better answer while someone is typing — this is what
 * remains for the moment they press the button anyway.
 */
export function passwordProblem(password: string): string | null {
  const unmet = unmetRules(password);
  if (unmet.length === 0) return null;
  const missing = unmet.map((rule) => rule.label.toLowerCase());
  return `Your password needs: ${missing.join(', ')}.`;
}
