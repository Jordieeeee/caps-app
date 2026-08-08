import { useCallback, useEffect, useState } from 'react';

export type AsyncState<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error' };

/**
 * Load-once-on-mount with the three states a screen actually has to render.
 *
 * A discriminated union rather than the usual `{ data, loading, error }` bag,
 * because that bag permits `loading: true` alongside `data` alongside `error` and
 * leaves each screen to invent its own precedence. Every screen inventing it
 * separately is how you get one screen showing a spinner over stale rows and
 * another showing an empty state during the first load. Here the states are
 * mutually exclusive by construction.
 *
 * Note "ready with an empty array" is deliberately not a fourth state: empty is a
 * property of the data, not of the load, and only the screen knows whether zero
 * rows means "no bills yet" or "no bills match this filter".
 */
export function useAsync<T>(load: () => Promise<T>) {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);

  const run = useCallback(async () => {
    try {
      const data = await load();
      setState({ status: 'ready', data });
    } catch {
      setState({ status: 'error' });
    }
    // `load` is expected to be a stable reference (a module function, or wrapped
    // in useCallback by the caller). An inline arrow would re-run this forever.
  }, [load]);

  const reload = useCallback(() => {
    setState({ status: 'loading' });
    setRefreshFailed(false);
    void run();
  }, [run]);

  /**
   * Re-fetch without taking the current answer off the screen.
   *
   * This is what a manual refresh control needs and what `reload` cannot give it:
   * `reload` blanks straight to the loading state, so tapping refresh on a list of
   * bills would replace the bills with a spinner and then put them back — a flash
   * that reads as data loss on a screen about money.
   *
   * A failed refresh keeps the data too, and says so through `refreshFailed`
   * instead of collapsing to the error state. Discarding rows we still hold, and
   * still believe, because a later request timed out would be the wrong claim in
   * the more alarming direction: "we have nothing for you" when we do. The screen
   * pairs the stale rows with a visible "couldn't update" line, so nothing is
   * presented as fresher than it is.
   *
   * Before the first successful load there is nothing to preserve, so a failure
   * there does fall through to the error state — hence the functional updater,
   * which reads the live state without this callback having to depend on it.
   * That dependency would matter: screens hand `refresh` to `useFocusEffect`, and
   * a callback with a new identity every render is an infinite refetch loop.
   */
  const refresh = useCallback(async () => {
    setRefreshing(true);
    setRefreshFailed(false);
    try {
      setState({ status: 'ready', data: await load() });
    } catch {
      setState((prev) => (prev.status === 'ready' ? prev : { status: 'error' }));
      setRefreshFailed(true);
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setState runs only after the await inside run(); the rule cannot see past the await boundary
    void run();
  }, [run]);

  return { state, reload, refresh, refreshing, refreshFailed };
}
