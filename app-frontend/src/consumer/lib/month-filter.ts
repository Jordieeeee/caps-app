import type { Account, Bill } from '@/consumer/types';
import type { Chip } from '@/shared/components/filter-chips';
import { formatBillingPeriod } from '@/shared/format/date';

/**
 * The billing-month filter, derived once for both consumer screens.
 *
 * Home and Bills each draw their own chip row, but the row has to mean the same
 * thing on both — which periods exist, what each one narrows, and what "no month
 * selected" leaves on screen. Two screens deriving that separately is the exact
 * class of bug this codebase keeps closing (see consumer/components/water-usage.tsx
 * and consumer/components/latest-reading.tsx, both shared for the same reason), and
 * a month row is a worse place than most to let it happen: a consumer who taps
 * `Aug 2026` on Home and `Aug 2026` on Bills and is shown two different figures has
 * no way to tell which screen is lying.
 *
 * ⚠️ WHAT A MONTH DOES NOT NARROW: the money. Account is a scope — a consumer with
 * two properties genuinely has two balances, so picking one has to move the
 * Outstanding tile with it. A month is a place to look. "What you owe" is a fact
 * about today, arrived at by adding every unpaid bill whenever it was issued, and
 * it does not become a smaller number because someone scrolled back to June. A tile
 * that fell to ₱200.00 while a household actually owed ₱1,400 would be read as the
 * amount to bring to the counter. So the helpers here narrow the usage history and
 * the unbilled reading, and the callers keep their totals on the account-scoped set.
 */

/**
 * One chip per period the household has something to look at, newest first.
 *
 * ⚠️ PERIODS COME FROM BILLS *AND* FROM UNBILLED READINGS. Building the row from
 * bills alone would make the month filter a control that can only ever hide the
 * meter-reading card and never show it: the reading's period is by definition one
 * the district has not billed, so `Sep 2026` would not be among the chips while the
 * September reading sat above them. Every period on screen gets a chip, or the row
 * does not describe the screen.
 *
 * Newest first because a bills list is read from the present backwards: the month
 * someone wants is almost always the last one or the one before it, and making them
 * scroll right to reach "this month" would invert the order every other part of
 * these screens uses.
 *
 * Labelled `Aug 2026`, not `August 2026`. The year cannot be dropped — a household
 * with a year of history has two Augusts — but spelling the month out makes every
 * chip wide enough that three fill the row, which turns a chooser into a scroll.
 * Bill rows underneath still spell it in full, where there is width for it and
 * where the period is being read rather than picked.
 */
export function monthChipsFor(
  bills: Bill[],
  accounts: Account[],
  selected: string | null
): Chip[] {
  const readingPeriods = new Set(
    accounts.map((a) => a.latestReading?.period).filter((p): p is string => Boolean(p))
  );

  const periods = new Set<string>([
    ...bills.map((b) => b.billingPeriod).filter(Boolean),
    ...readingPeriods,
    /**
     * The SELECTED month survives even when nothing in the current account scope
     * falls in it.
     *
     * Switching from "All accounts" to a property connected later can empty the
     * chosen month, and without this the chip carrying the selection would vanish
     * while the selection itself stayed in force — an empty screen under a row that
     * gives no hint why, with the state that caused it no longer on it. Keeping the
     * chip makes the reason visible and, more to the point, tappable.
     */
    ...(selected ? [selected] : []),
  ]);

  return [...periods]
    .sort((a, b) => b.localeCompare(a))
    .map((period) => {
      const count = bills.filter((b) => b.billingPeriod === period).length;
      return {
        id: period,
        label: shortBillingPeriod(period),
        /**
         * No number at all on a period that holds only an unbilled reading.
         *
         * `0` is the wrong thing to print beside a chip that, when tapped, fills
         * the screen with the meter reading for that month — it reads as a dead
         * control and invites the reader to skip the one period with news in it.
         * FilterChips omits the count entirely when it is undefined, which says
         * "nothing billed here yet" without claiming the month is empty.
         */
        ...(count > 0 ? { count } : {}),
      };
    });
}

/** `2026-08` → `Aug 2026`. See `monthChipsFor` on why the month is abbreviated. */
export function shortBillingPeriod(period: string): string {
  const full = formatBillingPeriod(period);
  const [month, year] = full.split(' ');
  return year ? `${month.slice(0, 3)} ${year}` : full;
}

/** The bills issued in the chosen month. Every bill when no month is chosen. */
export function billsInMonth(bills: Bill[], month: string | null): Bill[] {
  return month ? bills.filter((b) => b.billingPeriod === month) : bills;
}

/**
 * The accounts whose unbilled reading belongs to the chosen month.
 *
 * Filters the ACCOUNTS rather than the readings because that is what
 * `LatestReadingCards` takes, and because an account whose reading falls outside
 * the month has nothing to contribute to the card — dropping the account drops its
 * card, which is the behaviour wanted, and keeping it with a blanked reading would
 * render an empty bordered box.
 *
 * An account with no reading at all is dropped under any month, exactly as
 * `LatestReadingCards` already drops it: there is no period to match it on, and
 * guessing one would put a reading under a month it was not taken in.
 */
export function accountsInMonth(accounts: Account[], month: string | null): Account[] {
  return month ? accounts.filter((a) => a.latestReading?.period === month) : accounts;
}
