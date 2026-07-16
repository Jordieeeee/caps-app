import type { Bill } from '@/consumer/data/mock-data';

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
  totalDue: number;
  /** The bill that needs attention first, or null when nothing is owed. */
  next: Bill | null;
  /** Negative when the due date has passed. */
  daysUntilDue: number | null;
  urgency: Urgency;
}

/** Whole days from today to `date`; negative once it is in the past. */
export function daysUntil(date: string, now: Date = new Date()): number {
  const due = new Date(`${date}T00:00:00`);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

/**
 * "Due soon" is seven days.
 *
 * Not an arbitrary round number: TWD bills monthly and a consumer who checks the
 * app roughly weekly must never first learn about a bill after it is late. Seven
 * days guarantees at least one look at it while it is still payable on time, and
 * paying means a trip to the office or waiting for a collector — this is not a
 * one-tap action that can be left to the last evening.
 */
const DUE_SOON_DAYS = 7;

export function summarise(bills: Bill[], now: Date = new Date()): BillSummary {
  const outstanding = bills
    .filter((b) => b.status !== 'paid')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const totalDue = outstanding.reduce((sum, b) => sum + b.amount, 0);
  const next = outstanding[0] ?? null;
  const days = next ? daysUntil(next.dueDate, now) : null;

  const urgency: Urgency = !next
    ? 'clear'
    : // Trust the server's `overdue` status, but do not depend on it: a bill can
      // sit at `pending` past its due date if nothing has re-run the status job.
      next.status === 'overdue' || (days !== null && days < 0)
      ? 'overdue'
      : days !== null && days <= DUE_SOON_DAYS
        ? 'due-soon'
        : 'scheduled';

  return { outstanding, totalDue, next, daysUntilDue: days, urgency };
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
