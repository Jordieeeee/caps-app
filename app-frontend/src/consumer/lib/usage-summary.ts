import type { Bill } from '@/consumer/types';
import { formatBillingPeriod } from '@/shared/format/date';

/**
 * "How much water have we been using?" — the question a bill answers badly.
 *
 * A peso figure on its own is not readable: ₱1,700 is only meaningful next to the
 * 48 m³ it charged for, and next to the 60 m³ the month before. This derives that
 * history from the bills already on screen.
 *
 * Derived on the client, unlike `daysOverdue`, and the difference is deliberate:
 * overdue depends on *today*, which a user-settable device clock gets wrong, so the
 * server owns it. This is a sum of figures the server already sent, and re-deriving
 * it here costs nothing and adds no second source that can disagree.
 */

export interface UsageMonth {
  /** `YYYY-MM`. */
  billingPeriod: string;
  cubicMetres: number;
}

export interface RecentUsage {
  /** Oldest first, so the list reads left-to-right as time passes. */
  months: UsageMonth[];
  totalCuM: number;
  /** Mean over `months.length`, not over three — see `label`. */
  averageCuM: number;
  /** The most recently billed month. Never null: `recentUsage` returns null instead. */
  latest: UsageMonth;
  /** The largest month in the window. Bars are drawn against this, not a fixed ceiling. */
  peakCuM: number;
  /**
   * Latest month against the one before it. Null when only one month is known —
   * there is nothing to compare against, and "no change" would be a lie.
   */
  change: { delta: number; from: UsageMonth } | null;
  /**
   * What the section can honestly call itself: "Past 3 months used" only when three
   * billed months were actually found.
   */
  label: string;
  /**
   * How many of the recent bills carried no reading at all. Non-zero means the
   * total is a floor, not the household's full usage, and the UI has to say so.
   */
  missing: number;
}

/** How many months "past 3 months" means. Monthly billing, so three bills. */
const MONTHS = 3;

/**
 * The last three *billed* months, newest bills first in, oldest first out.
 *
 * ⚠️ Counts billing periods, not calendar months back from today. If TWD last
 * issued a bill in May, this returns March–May and says "Past 3 months used" of a
 * window that ended in May — which is why the UI prints the period names underneath.
 * The alternative, filtering to the three calendar months before today, would show
 * an empty section to a consumer whose bills are simply behind, and blame the app's
 * silence on data that exists.
 *
 * Returns null when no recent bill carries a reading: there is no usage history to
 * show, and a section reading "0 m³" would be a statement about the household's
 * water use rather than about our data.
 */
export function recentUsage(bills: Bill[], limit: number = MONTHS): RecentUsage | null {
  const recent = [...bills]
    .sort((a, b) => b.billingPeriod.localeCompare(a.billingPeriod))
    .slice(0, limit);

  const months: UsageMonth[] = [];
  let missing = 0;

  for (const bill of recent) {
    if (bill.consumptionCuM === null || !Number.isFinite(bill.consumptionCuM)) {
      missing += 1;
      continue;
    }
    months.push({ billingPeriod: bill.billingPeriod, cubicMetres: bill.consumptionCuM });
  }

  if (months.length === 0) return null;

  months.reverse();
  const totalCuM = months.reduce((sum, m) => sum + m.cubicMetres, 0);
  const latest = months[months.length - 1];
  const previous = months.length > 1 ? months[months.length - 2] : null;

  return {
    months,
    totalCuM,
    averageCuM: totalCuM / months.length,
    latest,
    peakCuM: Math.max(...months.map((m) => m.cubicMetres)),
    change: previous ? { delta: latest.cubicMetres - previous.cubicMetres, from: previous } : null,
    label: usageLabel(months.length),
    missing,
  };
}

/**
 * Never "Past 3 months used" over two months of data.
 *
 * The count in the heading is the count of months actually summed. A consumer with
 * two bills who reads "Past 3 months" divides by the wrong number when they compare
 * it to a neighbour's, and it makes the app look like it lost a month.
 */
function usageLabel(count: number): string {
  if (count === 1) return 'Last month used';
  return `Past ${count} months used`;
}

/**
 * "12 m³ less than June 2026" — the comparison, in words, with its baseline named.
 *
 * The baseline is always printed. "Down 12 m³" alone invites the reader to supply
 * their own comparison (last year? the district average?), and the only one this
 * app can support is the month immediately before.
 *
 * ⚠️ Deliberately no judgement. Not "Great, you used less!" — a drop in consumption
 * is as likely to be a leaking meter that stopped registering, a household away for
 * a month, or an estimated reading as it is a household being careful. The app
 * reports the change; the consumer knows which of those it was.
 */
export function changeLabel(change: RecentUsage['change']): string | null {
  if (!change) return null;

  const month = formatBillingPeriod(change.from.billingPeriod);
  if (change.delta === 0) return `Same as ${month}`;
  const magnitude = formatCuM(Math.abs(change.delta));
  return change.delta > 0 ? `${magnitude} more than ${month}` : `${magnitude} less than ${month}`;
}

/**
 * `48` → `"48 m³"`. Whole cubic metres unless the meter recorded a fraction.
 *
 * m³ rather than "cu.m." because this is a phone screen with the room for it; the
 * printed receipt keeps "cu.m." — a PT-210 has no ³ glyph in its code page and
 * prints a blank there. See shared/utils/daily-report.ts.
 */
export function formatCuM(cubicMetres: number): string {
  if (!Number.isFinite(cubicMetres)) return '—';
  const rounded = Math.round(cubicMetres * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} m³`;
}
