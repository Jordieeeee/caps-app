import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import type { Bill } from '@/consumer/services/consumer-data';
import { Icon } from '@/shared/components/icon';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { MIN_TAP_TARGET, Radius, Spacing } from '@/shared/theme/twd';

/**
 * The month, with today marked and every bill due date on it.
 *
 * Home already says what is owed and when in words — "₱2,144.00, 16 days
 * overdue". This answers the question those words leave open for someone
 * holding two properties and three unpaid periods: WHERE IN THE MONTH do the
 * dates fall, and is anything landing before payday. A sentence cannot show
 * that; a grid can, and it is the one shape everybody already reads.
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

export function BillCalendar({ bills, now = new Date() }: { bills: Bill[]; now?: Date }) {
  const theme = useTwdTheme();

  const { cells, dueByDay, outsideMonth, todayDay } = useMemo(() => {
    const year = now.getFullYear();
    const month = now.getMonth();

    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Leading blanks so the 1st lands under its weekday, then the days.
    const grid: (number | null)[] = [
      ...Array.from({ length: firstWeekday }, () => null),
      ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];

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
      todayDay: now.getDate(),
    };
  }, [bills, now]);

  const colourFor = (status: Bill['status']) =>
    status === 'overdue' ? theme.danger : status === 'pending' ? theme.warning : theme.success;

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="defaultBold">{monthName(now)}</ThemedText>

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

      <View style={styles.grid}>
        {cells.map((day, i) => {
          const status = day ? dueByDay.get(day) : undefined;
          const isToday = day === todayDay;

          return (
            <View key={day ?? `blank-${i}`} style={styles.cell}>
              <View style={[styles.dayCircle, isToday && { backgroundColor: theme.primary }]}>
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
                  legend below names what each one means. */}
              <View
                style={[
                  styles.dot,
                  status ? { backgroundColor: colourFor(status) } : styles.dotHidden,
                ]}
              />
            </View>
          );
        })}
      </View>

      <View style={styles.legend}>
        <Legend colour={theme.danger} label="Overdue" />
        <Legend colour={theme.warning} label="Due" />
        <Legend colour={theme.success} label="Paid" />
      </View>

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

function Legend({ colour, label }: { colour: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.dot, { backgroundColor: colour }]} />
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

const CELL = `${100 / 7}%`;

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
  week: { flexDirection: 'row' },
  weekday: { width: CELL, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: CELL, alignItems: 'center', paddingVertical: Spacing.half },
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
export function BillCalendarButton({ bills, now = new Date() }: { bills: Bill[]; now?: Date }) {
  const theme = useTwdTheme();
  const [open, setOpen] = useState(false);

  const label = now.toLocaleDateString('en-PH', { day: 'numeric', month: 'short' });

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.trigger, { opacity: pressed ? 0.6 : 1 }]}
        accessibilityRole="button"
        accessibilityLabel={`Today is ${now.toLocaleDateString('en-PH', {
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
            <BillCalendar bills={bills} now={now} />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
