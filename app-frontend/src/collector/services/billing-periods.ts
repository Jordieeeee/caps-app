import { OfflineStorage } from '@/collector/services/offline-storage';
import { RouteAccountService } from '@/collector/services/route-accounts';
import { formatBillingPeriod, localDateKey, monthKeyOf } from '@/shared/format/date';
import {
  calculateBill,
  dueDateFor,
  invoiceNumberFor,
} from '@/shared/utils/billing-calculator';

/**
 * The collector's own work, cut into calendar months.
 *
 * ⚠️ THE REPORTS SCREEN USED TO BE THREE HARD-CODED MONTHS. `mockBillingPeriods`
 * offered July/June/May **2025** — a list that was already a year stale, that never
 * moved whatever the date was, and that carried invented aggregates (₱202,500
 * across 450 invoices) beside three invented households on WD-XXXXX accounts that
 * appear nowhere in TWD's data. The periods are now generated from the clock and
 * every figure under them is derived from records this phone actually holds.
 *
 * The source is the reading outbox, deliberately, and it is the only source
 * available: a bill is what a reading calculates to, `calculateBill` is the same
 * function that produced the paper the consumer was handed at the meter, and the
 * collector's handset is the one place both halves exist offline. Nothing here
 * calls the server — this screen has to open in a barangay with no signal, same as
 * every other collector screen.
 *
 * WHAT IS DELIBERATELY ABSENT: paid / overdue. Those describe money reaching TWD,
 * and this app no longer models that at all — collectors read meters, consumers pay
 * at the office, and the district's payment record lives in the portal behind an
 * endpoint scoped to the consumer who owns the account. Marking a bill "Overdue"
 * from a due date alone would be an assertion about a payment we cannot see. The
 * status that IS knowable — and is the one the collector can act on — is whether
 * the invoice has reached TWD, so that is what the list carries.
 */

/** One invoice the collector issued: a reading, and what it billed to. */
export interface PeriodInvoice {
  /** The reading's clientId — also the sync key. */
  id: string;
  invoiceNo: string;
  accountNumber: string;
  consumerName: string;
  address: string;
  readingDate: string;
  dueDate: string;
  amount: number;
  previousReading: number;
  currentReading: number;
  consumption: number;
  /** Whether TWD has this record. The only status this screen can honestly claim. */
  synced: boolean;
}

export interface BillingPeriod {
  /** `2026-08`. Sorts lexically, which is also chronologically. */
  id: string;
  /** `August 2026` — the month and year, as of whenever this ran. */
  name: string;
  /** `YYYY-MM-DD`, first and last day of the month. */
  startDate: string;
  endDate: string;
  /** True for the month the device is in right now: it is still being worked. */
  current: boolean;
  invoices: PeriodInvoice[];
  totalInvoices: number;
  totalBilled: number;
  pendingSync: number;
}

/** Last day of a `YYYY-MM`, leap years included — day 0 of the next month. */
function endOfMonth(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  return localDateKey(new Date(year, month, 0));
}

/**
 * How many months the filter offers, counting back from the current one.
 *
 * A full year, so every month of the billing calendar is reachable — including the
 * same month last year, which is the comparison anyone looking at a water bill
 * actually wants ("is this house using more than it did last August?").
 */
const MONTHS_OFFERED = 12;

/** The last `MONTHS_OFFERED` month keys, newest first, ending with `now`'s month. */
function recentMonthKeys(now: Date): string[] {
  const keys: string[] = [];
  // Walks the month index rather than subtracting days: `new Date(y, m - i, 1)`
  // normalises a negative month into the previous year on its own, so December →
  // January needs no special case and no leap-year arithmetic.
  for (let i = 0; i < MONTHS_OFFERED; i++) {
    keys.push(monthKeyOf(localDateKey(new Date(now.getFullYear(), now.getMonth() - i, 1))));
  }
  return keys;
}

/**
 * Every month of the past year, newest first, plus any older month that has
 * readings on this phone.
 *
 * The list used to hold only months that had readings, which on a fresh handset is
 * exactly one chip — a "filter" with nothing to filter between. Twelve months are
 * offered whether or not they contain work, because the collector is choosing a
 * period to look at and cannot choose one that is not on screen; an empty one
 * answers "nothing was billed in March" rather than leaving them to wonder whether
 * March is missing or empty.
 *
 * Never a future month. A billing period that has not happened cannot have been
 * billed, and a "December 2026" chip offered in August is a promise the calendar
 * has not kept yet. Older months outside the window still appear when they hold
 * readings — a record that exists is never hidden by the size of the window.
 */
export async function loadBillingPeriods(now: Date = new Date()): Promise<BillingPeriod[]> {
  const [readings, accounts] = await Promise.all([
    OfflineStorage.getMeterReadings(),
    // Cache only. Names and addresses decorate the invoice; their absence must not
    // stop the report from rendering, and the network is not available anyway.
    RouteAccountService.getCached(),
  ]);

  const accountFor = new Map(accounts.map((a) => [a.accountNumber, a]));
  const months = recentMonthKeys(now);
  const currentMonth = months[0];

  // Seeded with the whole window so every month has a chip; readings then fill
  // them in, and any month older than the window is added by the loop below.
  const byMonth = new Map<string, PeriodInvoice[]>(months.map((m) => [m, []]));

  for (const reading of readings) {
    const month = monthKeyOf(reading.readingDate);
    const invoices = byMonth.get(month) ?? [];
    const account = accountFor.get(reading.accountNumber);

    invoices.push({
      id: reading.id,
      invoiceNo: invoiceNumberFor(reading.accountNumber, reading.readingDate),
      accountNumber: reading.accountNumber,
      // Falls back to the account number rather than "Unknown": a reading can
      // outlive its route cache, and the number is what the office looks the
      // household up by.
      consumerName: account?.consumerName ?? reading.accountNumber,
      address: account?.address ?? '',
      readingDate: reading.readingDate,
      dueDate: dueDateFor(reading.readingDate),
      // The same calculation that printed the consumer's copy at the meter. Not a
      // stored amount: the reading is what was recorded, and re-deriving the bill
      // from it means the report and the paper can never disagree.
      amount: calculateBill(reading.consumption).totalAmountDue,
      previousReading: reading.previousReading,
      currentReading: reading.currentReading,
      consumption: reading.consumption,
      synced: reading.synced,
    });

    byMonth.set(month, invoices);
  }

  return [...byMonth.entries()]
    .map(([month, invoices]) => {
      // Newest reading first within a period — the collector is checking recent
      // work far more often than they are auditing the start of the month.
      invoices.sort((a, b) => b.readingDate.localeCompare(a.readingDate));

      return {
        id: month,
        name: formatBillingPeriod(month),
        startDate: `${month}-01`,
        endDate: endOfMonth(month),
        current: month === currentMonth,
        invoices,
        totalInvoices: invoices.length,
        totalBilled: invoices.reduce((sum, i) => sum + i.amount, 0),
        pendingSync: invoices.filter((i) => !i.synced).length,
      };
    })
    .sort((a, b) => b.id.localeCompare(a.id));
}
