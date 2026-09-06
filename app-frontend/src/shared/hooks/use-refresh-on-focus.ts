import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';
import { InteractionManager } from 'react-native';

/**
 * Re-read this screen's data when the reader comes back to it.
 *
 * The first focus is skipped: `useAsync` has already loaded on mount, and both
 * firing meant two identical round trips every time a tab was opened cold.
 *
 * ⚠️ THE REFRESH WAITS FOR THE TRANSITION. DO NOT PUT IT BACK ON THE FOCUS FRAME.
 *
 * `useFocusEffect` fires as the navigation BEGINS, not when it ends. Refreshing
 * there re-renders the list — changing how many children its container holds —
 * while react-native-screens is still re-attaching this screen's native views. The
 * two disagree, and Fabric's mounting layer fails on device with `addViewAt:
 * failed to insert view … The specified child already has a parent`, a crash whose
 * stack contains nothing of ours. See use-refresh-on-change.ts, the collector's
 * equivalent, where this was diagnosed.
 *
 * `runAfterInteractions` moves the re-render to after the animation has settled.
 * The handle is cancelled on blur, so a refresh scheduled by a screen the reader
 * has already left never lands.
 *
 * Pull-to-refresh does not go through here and still forces a real reload — that
 * one is a person asking, and no transition is in flight.
 *
 * Pass a STABLE `refresh` (the one `useAsync` returns already is). This is the
 * dependency of a focus effect, so a new identity every render re-registers the
 * effect every render.
 */
export function useRefreshOnFocus(refresh: () => unknown): void {
  const settledFirstFocus = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (!settledFirstFocus.current) {
        settledFirstFocus.current = true;
        return;
      }

      const handle = InteractionManager.runAfterInteractions(() => {
        void refresh();
      });

      return () => handle.cancel();
    }, [refresh])
  );
}
