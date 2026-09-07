import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import type { Bill } from '@/consumer/services/consumer-data';
import { Icon } from '@/shared/components/icon';
import { useToday } from '@/shared/hooks/use-today';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { MIN_TAP_TARGET, Radius, Spacing } from '@/shared/theme/twd';
import { DUE_DAY, READING_DAY, ordinal } from '@/shared/utils/billing-cycle';

/**
 * The month, with today marked, the district's cycle on it, and every bill due
 * date on top of that.
 *
 * Home already says what is owed and when in words — "₱2,144.00, 16 days
 * overdue". This answers the question those words leave open for someone
 * holding two properties and three unpaid periods: WHERE IN THE MONTH do the
 * dates fall, and is anything landing before payday. A sentence cannot show
 * that; a grid can, and it is the one shape everybody already reads.
 *
 * ONLY TWO DAYS IN THE MONTH EVER CARRY A MARK: the 22nd a meter is read, and
 * the 7th a bill falls due. Nothing else is marked, and that is now true by
 * construction rather than by filtering here — `consumer-data` normalises every
 * bill onto the district's due day as it arrives, so a dot cannot land on the
 * 12th no matter what date the portal stamped. This grid does no date
 * correction of its own; if a mark ever appears somewhere else, the boundary
 * let it through and that is where to look.
 *
 * A scheduled day is an outline, a real bill is filled. The 7th shows the
 * outline in a month this household owes nothing and a filled status dot in a
 * month it does — the fill wins, because what a household owes outranks what
 * the calendar expects.
 *
 * The schedule is drawn from `shared/utils/billing-cycle` rather than written
 * in here, so this grid cannot drift from the due date the collector's receipt
 * prints.
 *
 * Deliberately not a date picker. Nothing here is selectable and nothing
 * navigates — it is a read-only view of dates the consumer does not choose.
 * Making the squares tappable would promise a per-day screen that does not
 * exist.
 */

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

interface DueMark {
  day: number;
  status: Bill['status'];
}

function monthName(date: Date): string {
  return date.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
}

export function BillCalendar({ bills, now }: { bills: Bill[]; now?: Date }) {
  const theme = useTwdTheme();
  /**
   * `now` stays injectable for callers that need a fixed date; unset, it is the
   * live day. It used to default to `new Date()` in the signature, which froze
   * the month at whatever render happened to mount this — so a calendar left open
   * across midnight kept yesterday circled, and one opened on the 1st drew the
   * previous month entirely.
   */
  const today = useToday();
  const when = now ?? today;

  const { cells, dueByDay, outsideMonth, todayDay } = useMemo(() => {
    const year = when.getFullYear();
    const month = when.getMonth();

    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    /**
     * Leading blanks so the 1st lands under its weekday, then the days, then
     * trailing blanks so the final week is a full seven.
     *
     * ⚠️ CHUNKED INTO WEEKS, NOT ONE WRAPPING LIST, AND THAT IS A BUG FIX.
     * This was a flat array in a `flexWrap` container whose cells were
     * `width: '14.285714285714286%'` (100/7). Yoga rounds each cell to the pixel
     * grid, seven rounded widths came out wider than the row, and the seventh
     * cell wrapped — so the grid rendered SIX columns, the Saturday column was
     * empty on every row, and every date sat under the wrong weekday. 22
     * September 2026 is a Tuesday and it was drawn under Friday.
     *
     * Explicit rows of seven `flex: 1` cells cannot round wrong: flex divides the
     * measured row, so the columns always sum to exactly the width available.
     * Do not reintroduce a percentage here.
     */
    const flat: (number | null)[] = [
      ...Array.from({ length: firstWeekday }, () => null),
      ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];
    while (flat.length % 7 !== 0) flat.push(null);
    const grid: (number | null)[][] = [];
    for (let i = 0; i < flat.length; i += 7) grid.push(flat.slice(i, i + 7));

    const marks = new Map<number, DueMark['status']>();
    let elsewhere = 0;

    for (const bill of bills) {
      const due = new Date(bill.dueDate);
      if (Number.isNaN(due.getTime())) continue;

      if (due.getFullYear() !== year || due.getMonth() !== month) {
        // Counted, never hidden. A due date in another month that this grid
        // silently dropped would be worse than no calendar: the consumer would
        // read an empty month as "nothing due".
        if (bill.status !== 'paid') elsewhere += 1;
        continue;
      }

      const day = due.getDate();
      // Worst status wins the day: two bills due on the same date, one overdue,
      // must not render as the calmer of the two.
      const current = marks.get(day);
      const rank = (s?: Bill['status']) => (s === 'overdue' ? 2 : s === 'pending' ? 1 : 0);
      if (!current || rank(bill.status) > rank(current)) marks.set(day, bill.status);
    }

    return {
      cells: grid,
      dueByDay: marks,
      outsideMonth: elsewhere,
      todayDay: when.getDate(),
    };
  }, [bills, when]);

  const colourFor = (status: Bill['status']) =>
    status === 'overdue' ? theme.danger : status === 'pending' ? theme.warning : theme.success;

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="defaultBold">{monthName(when)}</ThemedText>

      <View style={styles.week}>
        {WEEKDAYS.map((d, i) => (
          <ThemedText
            // Weekday initials repeat (S…S, T…T), so the index is the only
            // stable key available here.
            key={`${d}-${i}`}
            type="small"
            themeColor="textSecondary"
            style={styles.weekday}>
            {d}
          </ThemedText>
        ))}
      </View>

      <View>
        {cells.map((week, w) => (
          <View key={`w${w}`} style={styles.week}>
            {week.map((day, i) => {
          const status = day ? dueByDay.get(day) : undefined;
          const isToday = day === todayDay;
          const cycle = day === READING_DAY ? 'reading' : day === DUE_DAY ? 'due' : undefined;

          return (
            <View key={day ?? `w${w}-blank-${i}`} style={styles.cell}>
              <View
                style={[
                  styles.dayCircle,
                  // The outline says "the district does something on this day".
                  // It sits under today's fill rather than beside it, so the
                  // 7th being today reads as today first and scheduled second.
                  cycle && !isToday && { borderWidth: 1, borderColor: theme.border },
                  isToday && { backgroundColor: theme.primary },
                ]}>
                <ThemedText
                  type="small"
                  style={[
                    styles.dayText,
                    isToday && { color: theme.onPrimary, fontWeight: '700' },
                  ]}>
                  {day ?? ''}
                </ThemedText>
              </View>
              {/* A dot, not a coloured number: the date has to stay readable,
                  and colour alone is not a signal this app relies on — the
                  legend below names what each one means.

                  A filled dot is a bill that exists. A hollow one is only the
                  schedule, and it yields the slot the moment a real bill lands
                  on that day — two marks stacked on one date would be read as
                  two bills. */}
              <View
                style={[
                  styles.dot,
                  status
                    ? { backgroundColor: colourFor(status) }
                    : cycle
                      ? { borderWidth: 1, borderColor: theme.border }
                      : styles.dotHidden,
                ]}
              />
                </View>
              );
            })}
          </View>
        ))}
      </View>

      {/* Two rows on purpose. The filled dots are bills this household has; the
          outline is the district's schedule. They were one wrapping row of four,
          which broke 3 + 1 and read as a layout accident rather than as the two
          different kinds of mark they are. */}
      <View style={styles.legend}>
        <Legend colour={theme.danger} label="Overdue" />
        <Legend colour={theme.warning} label="Due" />
        <Legend colour={theme.success} label="Paid" />
      </View>
      <View style={styles.legend}>
        <Legend outline colour={theme.border} label="Reading / due day" />
      </View>

      {/* The schedule in words as well as marks. Someone who opens this in the
          first week of the month sees a grid whose two outlines mean nothing
          until something names them, and this is also the only place the app
          states when to expect the meter reader at all. */}
      <ThemedText type="small" themeColor="textSecondary">
        Meters are read on the {ordinal(READING_DAY)} of each month. Bills for that
        reading fall due on the {ordinal(DUE_DAY)} of the next.
      </ThemedText>

      {outsideMonth > 0 && (
        <ThemedText type="small" themeColor="textSecondary">
          {outsideMonth === 1
            ? '1 more unpaid bill is due in another month.'
            : `${outsideMonth} more unpaid bills are due in other months.`}
        </ThemedText>
      )}
    </ThemedView>
  );
}

/**
 * `outline` draws the swatch hollow, matching the schedule marks in the grid —
 * the legend has to distinguish them the same way the days do, or the outline
 * is a shape with no key.
 */
function Legend({ colour, label, outline }: { colour: string; label: string; outline?: boolean }) {
  return (
    <View style={styles.legendItem}>
      <View
        style={[
          styles.dot,
          outline ? { borderWidth: 1, borderColor: colour } : { backgroundColor: colour },
        ]}
      />
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    minHeight: MIN_TAP_TARGET,
    paddingHorizontal: Spacing.two,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  sheet: { width: '100%', maxWidth: 380 },
  card: {
    padding: Spacing.four,
    borderRadius: Radius.card,
    gap: Spacing.two,
  },
  // Seven flex:1 children divide the measured row exactly. No percentage, so
  // nothing can round past 100% and wrap — see the note in the grid builder.
  week: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center' },
  cell: { flex: 1, alignItems: 'center', paddingVertical: Spacing.half },
  dayCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: { fontVariant: ['tabular-nums'] },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 2 },
  dotHidden: { backgroundColor: 'transparent' },
  legend: { flexDirection: 'row', gap: Spacing.three, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
});

/**
 * Today's date in the header, and the month behind it on tap.
 *
 * The grid used to sit inline on Home, between the balance and usage. It was
 * the largest thing on the screen and answered the smallest question — most
 * opens are "what do I owe", not "where do the dates fall" — so it pushed the
 * answer people came for below the fold. As a header action it costs no
 * vertical space at all (ScreenHeader puts it on the title's own row) and the
 * grid is one tap away for the opens that do want it.
 *
 * The trigger is text, not an icon alone: the date is worth reading at a glance
 * even when nobody opens the calendar, and an icon by itself would be a control
 * whose purpose you have to tap to discover.
 */
export function BillCalendarButton({ bills, now }: { bills: Bill[]; now?: Date }) {
  const theme = useTwdTheme();
  const [open, setOpen] = useState(false);
  // Same live day as the grid it opens, from the same single ticker — two clocks
  // could paint "30 Sep" in the header above a grid that had rolled to October.
  const today = useToday();
  const when = now ?? today;

  const label = when.toLocaleDateString('en-PH', { day: 'numeric', month: 'short' });

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.trigger, { opacity: pressed ? 0.6 : 1 }]}
        accessibilityRole="button"
        accessibilityLabel={`Today is ${when.toLocaleDateString('en-PH', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}`}
        accessibilityHint="Opens a calendar showing when your bills are due">
        <Icon name="calendar" size={18} color={theme.textSecondary} />
        <ThemedText type="small" themeColor="textSecondary">
          {label}
        </ThemedText>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        // Android's back gesture must close this, not leave the consumer stuck
        // behind a dialog with no visible way out.
        onRequestClose={() => setOpen(false)}>
        {/* The backdrop is the dismiss target. A popover with no obvious way to
            close it is the reason people force-quit apps. */}
        <Pressable
          // A plain black scrim rather than a theme token: there is no scrim in
          // the palette, and a dimmed ground reads correctly in both themes
          // because the card above it carries its own themed surface.
          style={styles.backdrop}
          onPress={() => setOpen(false)}
          accessibilityRole="button"
          accessibilityLabel="Close calendar">
          {/* Swallows taps so pressing the calendar itself does not dismiss it. */}
          <Pressable style={styles.sheet} onPress={() => {}}>
            <BillCalendar bills={bills} now={when} />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
