import { formatAmount } from '@/shared/format/currency';
import { UTILITY_ADDRESS, UTILITY_NAME } from '@/shared/utils/billing-calculator';

/**
 * The collector's daily report, as printable lines.
 *
 * Pure formatting, kept beside `formatReceiptLines` in shared/utils rather than
 * inside document-service, for the same reason that one lives here: the module
 * that turns lines into a PDF imports expo-print/expo-sharing/expo-file-system,
 * which are native and cannot be loaded outside a device build. Keeping the
 * layout separate means the document's contents can be asserted against in plain
 * Node — an array of fixed-width strings is testable; a PDF is not.
 */

/** One line of the daily report. Mirrors the rows the Daily Summary screen shows. */
export interface DailyReportRow {
  accountNumber: string;
  consumerName: string;
  consumption: number;
  amountDue: number;
  synced: boolean;
}

export interface DailyReport {
  collectorName: string;
  routeIds: string[];
  /** `YYYY-MM-DD`. */
  date: string;
  rows: DailyReportRow[];
  accountsRead: number;
  totalOnRoute: number;
  generatedAt: number;
}

/**
 * The report is 48 columns, not the receipt's 32.
 *
 * The receipt's width is dictated by the PT-210's paper and has to stay there.
 * This document has no paper counterpart — it is generated for the office — so it
 * is free to use the page it is actually printed on, and 48 columns is what fits
 * an account number, a name, a consumption figure and an amount on one line
 * without truncating the name to initials.
 */
const REPORT_WIDTH = 48;

/**
 * Amounts are `PHP 486.00`, never `₱486.00`.
 *
 * The document renders in a monospace face, and Courier has no U+20B1. The
 * renderer falls back per-glyph to a proportional font for that one character,
 * whose advance width does not match the monospace cell — so every line carrying
 * a peso sign ends up a fraction of a character short and the right-aligned
 * amount column stops lining up. `formatAmount` is the same ASCII-only formatter
 * the printed receipt uses, for a related reason: see TRANSLITERATE in
 * collector/services/escpos.ts, where the PT-210 drops non-ASCII outright.
 */

const REPORT_RULE = '='.repeat(REPORT_WIDTH);
const REPORT_THIN_RULE = '-'.repeat(REPORT_WIDTH);

function reportCenter(text: string): string {
  const t = text.length > REPORT_WIDTH ? text.slice(0, REPORT_WIDTH) : text;
  return ' '.repeat(Math.floor((REPORT_WIDTH - t.length) / 2)) + t;
}

/** `Label................Value`, with the value hard against the right margin. */
function reportRow(label: string, value: string): string {
  const gap = REPORT_WIDTH - label.length - value.length;
  return gap >= 1 ? `${label}${' '.repeat(gap)}${value}` : `${label} ${value}`.slice(0, REPORT_WIDTH);
}

function stamp(epochMs: number): string {
  const d = new Date(epochMs);
  const p = (n: number) => `${n}`.padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * The collector's day, as filed.
 *
 * Deliberately reports `synced` per row and counts unsent records in the summary.
 * A report that showed only readings and totals would be indistinguishable
 * whether or not the office had actually received them, and "I filed it" versus
 * "TWD has it" is the exact distinction the sync badges exist to keep visible.
 * See the sync vocabulary in shared/components/status-badge.tsx.
 */
export function formatDailyReportLines(report: DailyReport): string[] {
  const lines: string[] = [];

  lines.push(REPORT_RULE);
  lines.push(reportCenter(UTILITY_NAME));
  lines.push(reportCenter(UTILITY_ADDRESS));
  lines.push(REPORT_RULE);
  lines.push(reportCenter('DAILY METER READING REPORT'));
  lines.push(REPORT_RULE);

  lines.push(reportRow('Collector:', report.collectorName));
  lines.push(reportRow('Route:', report.routeIds.join(', ') || 'Unassigned'));
  lines.push(reportRow('Date:', report.date));
  lines.push(reportRow('Generated:', stamp(report.generatedAt)));
  lines.push(REPORT_RULE);

  lines.push('READINGS');
  lines.push(REPORT_THIN_RULE);

  if (report.rows.length === 0) {
    lines.push('No meter readings recorded for this date.');
  }

  for (const row of report.rows) {
    lines.push(reportRow(row.accountNumber, row.synced ? 'Sent' : 'Pending sync'));
    // Name on its own line: a Filipino full name plus an account number does not
    // fit 48 columns, and truncating the consumer's name on the district's own
    // report is not a trade worth making for one saved line.
    lines.push(`  ${row.consumerName}`.slice(0, REPORT_WIDTH));
    lines.push(reportRow(`  ${row.consumption} cu.m.`, `PHP ${formatAmount(row.amountDue)}`));
    lines.push('');
  }

  const totalBilled = report.rows.reduce((sum, r) => sum + r.amountDue, 0);
  const pending = report.rows.filter((r) => !r.synced).length;

  lines.push(REPORT_RULE);
  lines.push('SUMMARY');
  lines.push(REPORT_THIN_RULE);
  lines.push(reportRow('Accounts read:', `${report.accountsRead} of ${report.totalOnRoute}`));
  lines.push(reportRow('Readings recorded:', `${report.rows.length}`));
  lines.push(reportRow('Pending sync:', `${pending}`));
  lines.push(reportRow('Total billed:', `PHP ${formatAmount(totalBilled)}`));
  lines.push(REPORT_RULE);

  // Stated, not implied. This document is generated on the handset from what the
  // handset holds; if records are still queued it is not yet what the office has.
  if (pending > 0) {
    lines.push('NOTE: This report includes readings that have');
    lines.push('not yet reached the TWD office. It reflects');
    lines.push('this device, not the office record.');
    lines.push(REPORT_RULE);
  }

  return lines;
}

