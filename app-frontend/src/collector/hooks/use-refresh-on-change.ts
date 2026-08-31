import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';

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
 */
export function useRefreshOnChange(refresh: () => unknown): void {
  const seen = useRef(collectorDataRevision());

  useFocusEffect(
    useCallback(() => {
      const current = collectorDataRevision();
      if (current === seen.current) return;
      seen.current = current;
      void refresh();
    }, [refresh])
  );
}
