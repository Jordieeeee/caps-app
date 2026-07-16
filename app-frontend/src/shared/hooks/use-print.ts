import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { State } from 'react-native-ble-plx';

import { PrinterService } from '@/collector/services/printer-service';
import { usePrinter } from '@/collector/services/printer-state';

/**
 * Every print action in the app goes through this hook.
 *
 * Printing receipts in the field is a core flow, not an edge case — the collector
 * is standing in front of a customer who expects paper. Before this hook, each
 * screen wrapped PrinterService in its own try/catch and most sent failures to
 * console.error, which nobody in the field can read; the button simply did nothing.
 *
 * It now also reports whether printing is possible *before* the tap, so callers can
 * disable the button and say why. Discovering "no printer" only after a collector
 * has committed to printing a receipt in front of a paying customer is the wrong
 * moment to find out; `canPrint` moves that discovery to the moment they look at
 * the screen. The preflight below stays regardless — `canPrint` is a live read of
 * the connection, and BLE can drop between the render and the tap.
 *
 * The preflight distinguishes the two failures a collector can actually fix,
 * because they have different fixes:
 *
 *   - Bluetooth off  → a phone setting; tell them which one.
 *   - No printer     → pairing; deep-link them to the printer screen.
 *
 * Every message ends by saying the record itself is safe. A collector who cannot
 * tell "the receipt didn't print" apart from "the payment didn't save" will
 * re-enter the payment, and a duplicate collection is a worse outcome than a
 * missing receipt.
 */
export function usePrint() {
  const router = useRouter();
  const printer = usePrinter();
  const [printing, setPrinting] = useState(false);

  const print = useCallback(
    async (job: () => Promise<void>) => {
      // Declared locally and called recursively so "Try again" re-runs the whole
      // preflight — a printer that failed once may have been switched off, and
      // retrying only `job()` would skip the check that catches it.
      async function attempt(): Promise<void> {
        setPrinting(true);
        try {
          const manager = PrinterService.getBleManager();
          const bleState = manager ? await manager.state() : null;

          if (bleState === State.PoweredOff) {
            Alert.alert(
              'Bluetooth is off',
              'Turn on Bluetooth in your phone settings, then try printing again.\n\nThe record is saved on this phone either way.',
              [{ text: 'OK' }]
            );
            return;
          }

          // Also the path when BLE was never initialised — there is no connection
          // either way, and the printer screen is where both get fixed.
          if (!PrinterService.isConnected()) {
            Alert.alert(
              'No printer connected',
              'Connect the PT-210 thermal printer first: make sure it is switched on, then pick it in printer settings.\n\nThe record is saved on this phone either way.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Printer settings', onPress: () => router.push('/collector/more/printer') },
              ]
            );
            return;
          }

          await job();
        } catch {
          // Retry or troubleshoot — the only two things a collector can do about a
          // printer that took the job and produced no paper.
          Alert.alert(
            'Could not print',
            'The printer did not respond. Check that it is switched on, has paper, and is within range.\n\nThe record is saved on this phone either way.',
            [
              { text: 'OK', style: 'cancel' },
              { text: 'Printer settings', onPress: () => router.push('/collector/more/printer') },
              { text: 'Try again', onPress: () => void attempt() },
            ]
          );
        } finally {
          setPrinting(false);
        }
      }

      await attempt();
    },
    [router]
  );

  return {
    print,
    printing,
    /** False when a Print button should be disabled. */
    canPrint: printer.status === 'connected',
    /** Short inline reason a Print button is disabled. Null when it isn't. */
    printBlockedReason:
      printer.status === 'connected'
        ? null
        : printer.status === 'connecting'
          ? 'Connecting to printer…'
          : 'Connect printer to print',
  };
}
