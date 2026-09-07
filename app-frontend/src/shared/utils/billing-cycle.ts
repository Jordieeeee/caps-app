/**
 * The district's billing cycle: when meters are read, and when bills fall due.
 *
 * TWD runs one cycle a month on fixed calendar days — the meter is read on the
 * 22nd, and the bill that reading produces falls due on the 7th of the month
 * after. These are not derived from each other and they are not a rolling window:
 * they are two dates the district publishes, and a household plans around them.
 *
 * ⚠️ THIS USED TO BE AN OFFSET, NOT A DATE. `dueDateFor` added `DUE_DAYS = 15` to
 * whatever day the collector happened to read the meter, which meant the due date
 * moved with the reading and landed on a different day of the month every period —
 * the 6th from a 31-day month, the 7th from a 30-day one, and anything at all when
 * a meter was read off-cycle. A due date that wanders is one nobody can plan
 * around, and it disagreed with the fixed date the office quotes over the counter.
 *
 * Both days exist in every month, February included, so nothing here has to clamp
 * a day that ran off the end of a short month. That is a property of 7 and 22
 * specifically — a cycle moved onto the 29th or the 31st would need that handling
 * added, and this comment is where to start looking when it is.
 */

/** The day of the month TWD reads meters. */
export const READING_DAY = 22;

/**
 * The day of the month a bill falls due — in the month AFTER the period it bills.
 *
 * A reading taken on 22 August closes the August period and is payable by
 * 7 September, which is the ~16-day window the district gives a household between
 * being read and being asked for money.
 */
export const DUE_DAY = 7;

/** `22` → `22nd`. Keeps user-facing copy honest if the constants above move. */
export function ordinal(day: number): string {
  // 11th, 12th and 13th break the last-digit rule and are the only exceptions
  // inside a month's range.
  if (day % 100 >= 11 && day % 100 <= 13) return `${day}th`;
  // Indices 4-9 are absent, so every other last digit falls through to 'th'.
  return `${day}${['th', 'st', 'nd', 'rd'][day % 10] ?? 'th'}`;
}

/** Splits `YYYY-MM`, or null when it is not one. String work — no Date, no drift. */
function parsePeriod(period: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year: Number(match[1]), month };
}

function pad(n: number): string {
  return `${n}`.padStart(2, '0');
}

/**
 * `2026-08` → `2026-08-22`, the day the August period's meter is read.
 *
 * Returns the period unchanged if it is not a `YYYY-MM`, matching how
 * `formatBillingPeriod` degrades: a bad period upstream shows as itself rather
 * than as a confidently wrong date.
 */
export function readingDateForPeriod(period: string): string {
  const parsed = parsePeriod(period);
  if (!parsed) return period;
  return `${parsed.year}-${pad(parsed.month)}-${pad(READING_DAY)}`;
}

/**
 * `2026-08` → `2026-09-07`, and `2026-12` → `2027-01-07`.
 *
 * The December rollover is handled by arithmetic on the month number rather than
 * by a Date, because constructing one here would reintroduce the timezone question
 * that `shared/format/date.ts` exists to keep out: a due date is a calendar day the
 * district decided, not an instant, and it must not shift by a day depending on
 * where the phone thinks it is.
 */
export function dueDateForPeriod(period: string): string {
  const parsed = parsePeriod(period);
  if (!parsed) return period;
  const year = parsed.month === 12 ? parsed.year + 1 : parsed.year;
  const month = parsed.month === 12 ? 1 : parsed.month + 1;
  return `${year}-${pad(month)}-${pad(DUE_DAY)}`;
}

/**
 * Any date → `DUE_DAY` of the month that date falls in, as `YYYY-MM-DD`.
 *
 * For due dates that arrive with no billing period attached to anchor them — a
 * notification's `dueDate`, say. Where a period IS available, use
 * `dueDateForPeriod` instead: the period is what the district bills against, and
 * a date can disagree with it.
 *
 * Read in UTC, for the reason `shared/format/date.ts` gives at length: a due date
 * is a calendar day the district decided, not an instant, and parsing a server
 * timestamp in a negative-offset zone would slide it into the previous month at
 * the boundary — turning a bill due on the 7th of October into one due on the 7th
 * of September, a month early.
 *
 * Returns the input unchanged when it is not a parseable date, so an unreadable
 * value degrades to itself rather than to a confidently wrong day.
 */
export function dueDateInMonthOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(DUE_DAY)}`;
}
