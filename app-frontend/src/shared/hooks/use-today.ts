import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { localDateKey } from '@/shared/format/date';

/**
 * The current calendar day, kept live.
 *
 * ⚠️ `new Date()` AT RENDER IS NOT A CLOCK, and that is what this replaces.
 * Every screen here took `now: Date = new Date()` as a default parameter, which
 * is evaluated once per render and then frozen until something else causes the
 * next one. Nothing in this app re-renders at midnight, so a phone left on the
 * Home screen overnight kept "today" on yesterday — and on the 1st of a month the
 * bill calendar went on drawing the whole of the previous month, with the wrong
 * weekday alignment for every date in it.
 *
 * TWO TRIGGERS, BECAUSE ONE IS NOT ENOUGH:
 *
 *   • A timer to the next local midnight. Covers the app being open across the
 *     boundary, which is the case a timer handles well.
 *   • `AppState` returning to `active`. iOS does not run timers while an app is
 *     suspended, so the overnight-in-the-background case — the common one for a
 *     collector who opens the app each morning — never fires the timer at all.
 *     The day is re-checked on every foreground instead of trusted to have ticked.
 *
 * LOCAL midnight, not UTC, and the distinction is the same one `localDateKey`
 * exists to enforce: Manila is UTC+8, so a UTC day boundary would roll this over
 * at 08:00 local and leave eight hours of every day disagreeing with the date on
 * the records. `localDateKey` is the shared definition of "which day is it" and
 * this compares against it rather than inventing a second answer.
 *
 * ONE TIMER FOR THE WHOLE APP. The store below is module-level with subscribers,
 * not per-hook state: `BillCalendar` renders inside the modal `BillCalendarButton`
 * opens, so both are mounted at once, and two independent timers could tick a few
 * milliseconds apart — long enough to paint a header reading "30 Sep" above a grid
 * that had already moved to October.
 */

let current = new Date();
const listeners = new Set<(d: Date) => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let appStateSub: { remove: () => void } | null = null;

/** Milliseconds until just after the next local midnight. */
function untilNextLocalMidnight(from: Date): number {
  // Built from local Y/M/D so it lands on the wall-clock boundary. Day + 1
  // normalises across month and year ends on its own, and a locale with DST gets
  // the correct shifted midnight rather than a fixed 86 400 000.
  const next = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1, 0, 0, 1, 0);
  return Math.max(1000, next.getTime() - from.getTime());
}

/** Publish only when the calendar DAY actually changed. */
function tick() {
  const now = new Date();
  if (localDateKey(now) !== localDateKey(current)) {
    current = now;
    for (const l of listeners) l(current);
  }
  schedule();
}

function schedule() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(tick, untilNextLocalMidnight(new Date()));
}

function start() {
  schedule();
  appStateSub = AppState.addEventListener('change', (state) => {
    // Re-check rather than assume the timer ran; it does not while suspended.
    if (state === 'active') tick();
  });
}

function stop() {
  if (timer) clearTimeout(timer);
  timer = null;
  appStateSub?.remove();
  appStateSub = null;
}

/**
 * Today, re-rendering the caller when the local day rolls over.
 *
 * The returned `Date` keeps its identity for the whole of a calendar day, which
 * makes it safe as a `useMemo` dependency — the previous `new Date()` default was
 * a fresh object on every render and defeated every memo it was passed to.
 */
export function useToday(): Date {
  /**
   * The freshness check lives in the initialiser, not in the effect.
   *
   * It has to happen somewhere: when nothing is mounted there is no timer and no
   * AppState listener, so `current` can be days stale by the time a screen opens
   * again. Doing it here means the FIRST render is already correct — checking it
   * in the effect instead meant rendering yesterday and then immediately setting
   * state, which is a wasted render and what `react-hooks/set-state-in-effect`
   * correctly objects to.
   *
   * Idempotent, so React calling it twice (StrictMode, or a discarded render)
   * changes nothing: it compares the day and either replaces `current` or leaves
   * it exactly as it was.
   */
  const [day, setDay] = useState(() => {
    if (localDateKey(new Date()) !== localDateKey(current)) current = new Date();
    return current;
  });

  useEffect(() => {
    listeners.add(setDay);
    if (listeners.size === 1) start();

    return () => {
      listeners.delete(setDay);
      if (listeners.size === 0) stop();
    };
  }, []);

  return day;
}
