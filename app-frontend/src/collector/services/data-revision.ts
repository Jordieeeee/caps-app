/**
 * A counter that changes whenever this phone's own collector data changes.
 *
 * ⚠️ THIS EXISTS TO STOP SIX SCREENS REFRESHING ON EVERY FOCUS. Each list screen
 * used to hand `refresh` straight to `useFocusEffect`, so returning to a tab — or
 * backing out of any pushed screen, or switching away and back — re-ran the loader
 * unconditionally. `refresh` sets `refreshing`, which drives the RefreshControl, so
 * an ordinary tab tap flashed a spinner over data that had not changed. Worse, the
 * route and order loaders check their own staleness window, so a focus landing after
 * that window could fire a network request the collector never asked for — in the
 * field, on a handset with no signal, that is a hang and a "could not reach TWD"
 * line for a screen somebody merely walked past.
 *
 * The refreshes still had to happen for one real reason: confirming a reading or a
 * service order happens on a PUSHED screen, and walking back must show the new
 * state. That is a change, and this counter is how a screen can tell a change from
 * a tab tap.
 *
 * Deliberately a plain module counter, not React state and not persisted:
 *
 *   - It only has to be comparable to the value a screen saw last. Nothing renders
 *     it, so putting it in a context or a store would add re-renders to a mechanism
 *     that exists to remove them.
 *   - It resets to 0 on app restart, which is correct: every screen re-mounts and
 *     loads fresh anyway, so there is no "missed" change to carry across a launch.
 *
 * Bumped by OfflineStorage on every write, which is the only place this phone's
 * collector data changes — including the background sync marking records sent, so a
 * "Pending sync" badge turns green the next time the collector looks at that list.
 */
let revision = 0;

/** Call after any write to the collector's local stores. */
export function bumpCollectorData(): void {
  revision += 1;
}

/** The current value, for a screen to compare against what it last loaded. */
export function collectorDataRevision(): number {
  return revision;
}
