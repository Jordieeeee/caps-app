import type { Bill } from '@/consumer/types';

/**
 * What a consumer opens the app to find out.
 *
 * Home and Bills both answer "what do I owe and when is it due?", so the answer
 * is derived once here rather than twice with two chances to disagree.
 */

export type Urgency = 'overdue' | 'due-soon' | 'scheduled' | 'clear';

export interface BillSummary {
  /** Every bill not yet paid, soonest due first. */
  outstanding: Bill[];
  /**
   * Sum of the outstanding bills that carry a total. A floor, not a promise:
   * check `unknownAmounts` before presenting it as what the household owes.
   */
  totalDue: number;
  /**
   * Outstanding bills whose amount the server sent as null. Non-zero means the
   * figure above is missing at least one bill, which the screen must say — a total
   * that quietly omits a bill sends someone to the counter with too little money.
   */
  unknownAmounts: number;
  /** The bill that needs attention first, or null when nothing is owed. */
  next: Bill | null;
  /** Negative when the due date has passed. */
  daysUntilDue: number | null;
  urgency: Urgency;
}

/**
 * Whole days from today to `date`; negative once it is in the past.
 *
 * Compared in UTC on both sides. This used to build the due date as
 * `new Date(\`${date}T00:00:00\`)`, which assumed the bare `YYYY-MM-DD` the mock
 * produced — against the server's real ISO timestamps that concatenation yields
 * `2026-07-31T00:00:00.000ZT00:00:00`, an Invalid Date, and every comparison
 * downstream silently becomes NaN. NaN loses every `<`/`<=` test, so a genuinely
 * overdue bill would quietly present as 'scheduled'.
 *
 * ⚠️ Client-side and therefore advisory only. The device clock is user-settable, so
 * the authoritative count is `bill.daysOverdue` from the server. This exists for
 * ordering and for the "due in N days" copy on bills that are not yet late.
 */
export function daysUntil(date: string, now: Date = new Date()): number {
  const due = new Date(date);
  if (Number.isNaN(due.getTime())) return 0;
  const dueDay = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((dueDay - today) / 86_400_000);
}

/**
 * "Due soon" is five days.
 *
 * ⚠️ This was seven, for a documented reason worth knowing before changing it
 * back or further: TWD bills monthly, paying means a trip to the office or
 * waiting for a collector, and seven days guaranteed that a consumer who opens
 * the app roughly weekly saw the bill at least once while it was still payable
 * on time. Five days narrows that guarantee — someone who checks on a Sunday
 * can now first meet a bill with four days left.
 *
 * It was lowered deliberately (requested 2026-08-26) so the alarming treatment
 * fires closer to the deadline and the card reads calm the rest of the month.
 * If consumers start reporting they "never saw it coming", this number is the
 * first thing to put back.
 */
const DUE_SOON_DAYS = 5;

export function summarise(bills: Bill[], now: Date = new Date()): BillSummary {
  const outstanding = bills
    .filter((b) => b.status !== 'paid')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const totalDue = outstanding.reduce((sum, b) => sum + (b.amount ?? 0), 0);
  const unknownAmounts = outstanding.filter((b) => b.amount === null).length;
  const next = outstanding[0] ?? null;
  const days = next ? daysUntil(next.dueDate, now) : null;

  const urgency: Urgency = !next
    ? 'clear'
    : // The server recomputes `status` and `daysOverdue` against server time on every
      // read, so `overdue` here is authoritative rather than a stale batch-job flag.
      // The local day count stays in the test as a backstop for an older server that
      // does not yet send daysOverdue.
      next.status === 'overdue' || next.daysOverdue > 0 || (days !== null && days < 0)
      ? 'overdue'
      : days !== null && days <= DUE_SOON_DAYS
        ? 'due-soon'
        : 'scheduled';

  return { outstanding, totalDue, unknownAmounts, next, daysUntilDue: days, urgency };
}

/** Plain-language due date. Never bare "in -3 days". */
export function dueLabel(days: number | null): string {
  if (days === null) return '';
  if (days < -1) return `${Math.abs(days)} days overdue`;
  if (days === -1) return 'Due yesterday';
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${days} days`;
}
