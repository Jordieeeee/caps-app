import { useSyncExternalStore } from 'react';

export type PrinterStatus = 'disconnected' | 'connecting' | 'connected';

export interface PrinterState {
  status: PrinterStatus;
  /** Present only while connected. */
  deviceName: string | null;
  deviceId: string | null;
}

/**
 * The printer's connection, as something the UI can watch.
 *
 * PrinterService exposed `isConnected(): boolean` and nothing else — a value you
 * could only read, never subscribe to. Two consequences, both of which break the
 * gating this store exists to support:
 *
 *   1. Screens read it once on mount and never heard about it again.
 *   2. Nothing observed BLE disconnection at all. Power the PT-210 off, walk out
 *      of range, or let its battery die, and the app still said "Connected" with
 *      every Print button enabled — a gate that is wrong precisely when it is
 *      supposed to fire.
 *
 * So the store is the source of truth and PrinterService reports into it, from
 * connect/disconnect and from react-native-ble-plx's own `onDisconnected` event.
 * No new dependency: the BLE library was already here for the PT-210.
 *
 * State is deliberately in memory only. A BLE connection does not survive the
 * process, so persisting "connected" across a restart would recreate exactly the
 * stale claim this replaces.
 */

let state: PrinterState = { status: 'disconnected', deviceName: null, deviceId: null };
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export const PrinterStore = {
  get(): PrinterState {
    return state;
  },

  set(next: PrinterState) {
    // Reference equality is the subscription's change signal, so only publish on a
    // real change — useSyncExternalStore would otherwise re-render on every poll.
    if (
      state.status === next.status &&
      state.deviceName === next.deviceName &&
      state.deviceId === next.deviceId
    ) {
      return;
    }
    state = next;
    emit();
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

/** Reactive printer state. Re-renders the caller when the PT-210 comes or goes. */
export function usePrinter(): PrinterState {
  return useSyncExternalStore(PrinterStore.subscribe, PrinterStore.get, PrinterStore.get);
}
