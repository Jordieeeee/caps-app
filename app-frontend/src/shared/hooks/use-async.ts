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
    void run();
  }, [run]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setState runs only after the await inside run(); the rule cannot see past the await boundary
    void run();
  }, [run]);

  return { state, reload };
}
