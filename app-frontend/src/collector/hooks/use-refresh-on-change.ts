import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';
import { InteractionManager } from 'react-native';

import { collectorDataRevision } from '@/collector/services/data-revision';

/**
 * Refresh when this screen regains focus AND something actually changed.
 *
 * Replaces the bare `useFocusEffect(() => void refresh())` that every collector
 * list used to run. That version could not tell "I just confirmed a reading and
 * walked back" from "I tapped the Route tab" — so it reloaded for both, flashed the
 * refresh spinner over unchanged data, and on a stale cache could reach for the
 * network on a screen the collector was only passing through. See
 * services/data-revision.ts.
 *
 * The first focus never refreshes: `useAsync` has just loaded on mount, and the ref
 * is seeded with the revision at that moment, so there is nothing to catch up on.
 * Two screens had already grown their own hand-rolled version of exactly this guard
 * (a `mounted` ref, a `settledFirstFocus` ref) — this is that idea, done once and
 * extended to notice writes rather than only the first render.
 *
 * Pull-to-refresh is untouched and still forces a real reload, because that one IS
 * a person asking.
 *
 * ⚠️ THE REFRESH WAITS FOR THE TRANSITION. DO NOT PUT IT BACK ON THE FOCUS FRAME.
 *
 * `useFocusEffect` fires as the pop BEGINS, not when it ends. Refreshing there
 * re-renders this screen's list — changing how many children its container holds —
 * while react-native-screens is still re-attaching that screen's native views. The
 * two disagree, and Fabric's mounting layer fails on device with:
 *
 *     java.lang.IllegalStateException: addViewAt: failed to insert view [2808]
 *       into parent [2814] at index 2
 *     Caused by: The specified child already has a parent.
 *
 * — a crash with nothing of ours in the stack, which is why it reads as a printer
 * bug when it happens. It does not: the print is long finished. The sequence is
 * save → revision bumps → `router.back()` → this hook fires mid-animation → the
 * list grows a row underneath the navigator. Plain back-navigation never crashes
 * because nothing changed, so this hook returns early and the tree stays still.
 *
 * `runAfterInteractions` moves the re-render to after the animation has settled,
 * which is the whole fix. The handle is cancelled on blur so a refresh scheduled by
 * a screen the collector has already left never lands.
 */
export function useRefreshOnChange(refresh: () => unknown): void {
  const seen = useRef(collectorDataRevision());

  useFocusEffect(
    useCallback(() => {
      const current = collectorDataRevision();
      if (current === seen.current) return;
      seen.current = current;

      const handle = InteractionManager.runAfterInteractions(() => {
        void refresh();
      });

      return () => handle.cancel();
    }, [refresh])
  );
}
