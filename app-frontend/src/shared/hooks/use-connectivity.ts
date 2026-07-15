import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { useCallback, useEffect, useState } from 'react';

export interface Connectivity {
  /** Null while the first probe is still in flight — distinct from "known offline". */
  isOnline: boolean | null;
  /** True once we have heard from NetInfo at least once. */
  isResolved: boolean;
  /**
   * Force a fresh probe. Backs the "Try again" affordance: NetInfo does notice
   * signal returning on its own, but a user who has just walked to a window wants
   * their tap to do something, not to wait on the next platform callback.
   */
  recheck: () => Promise<boolean>;
}

/**
 * Treat a state as online only when the internet is actually reachable.
 *
 * `isConnected` alone is not enough: a handset attached to a barangay wifi
 * access point with no upstream reports isConnected=true and cannot reach the
 * API. `isInternetReachable` is null while NetInfo is still probing, in which
 * case we fall back to isConnected rather than block the UI on the probe.
 */
function toOnline(state: NetInfoState): boolean {
  if (state.isInternetReachable === null) return Boolean(state.isConnected);
  return Boolean(state.isConnected && state.isInternetReachable);
}

/**
 * Live connectivity. Used to pick the offline/loading treatment and to re-run
 * session restore when signal comes back.
 */
export function useConnectivity(): Connectivity {
  const [isOnline, setIsOnline] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;

    NetInfo.fetch().then((state) => {
      if (active) setIsOnline(toOnline(state));
    });

    const unsubscribe = NetInfo.addEventListener((state) => {
      if (active) setIsOnline(toOnline(state));
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const recheck = useCallback(async () => {
    const online = toOnline(await NetInfo.refresh());
    setIsOnline(online);
    return online;
  }, []);

  return { isOnline, isResolved: isOnline !== null, recheck };
}

/** One-shot connectivity probe for code outside the component tree. */
export async function checkOnline(): Promise<boolean> {
  return toOnline(await NetInfo.fetch());
}
