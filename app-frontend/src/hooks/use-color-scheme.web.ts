import { useSyncExternalStore } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

const subscribe = () => () => {};

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web.
 *
 * `useSyncExternalStore` rather than a `useState` + `useEffect` "hasHydrated" flag: the effect
 * version calls `setState` synchronously from inside the effect body, which is exactly the
 * cascading-render pattern `react-hooks/set-state-in-effect` exists to catch. There's no
 * external store being subscribed to here — snapshot is `true` because we're actually running
 * on the client, `getServerSnapshot` is `false` because static rendering never is — so this
 * needs no effect at all.
 */
function useHasHydrated() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );
}

export function useColorScheme() {
  const hasHydrated = useHasHydrated();
  const colorScheme = useRNColorScheme();

  if (hasHydrated) {
    return colorScheme;
  }

  return 'light';
}
