import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { State } from 'react-native-ble-plx';

import { PrinterService } from '@/collector/services/printer-service';

/**
 * Every print action in the app goes through this hook.
 *
 * Printing receipts in the field is a core flow, not an edge case — the collector
 * is standing in front of a customer who expects paper. Before this hook, each
 * screen wrapped PrinterService in its own try/catch and most sent failures to
 * console.error, which nobody in the field can read; the button simply did
 * nothing. Worse, there was no UI anywhere for connecting a printer at all, so
 * `print()` threw "No printer connected" on every attempt on every screen since
 * the day it shipped.
 *
 * The preflight distinguishes the two failures a collector can actually fix,
 * because they have different fixes:
 *
 *   - Bluetooth off  → a phone setting; tell them which one.
 *   - No printer     → pairing; deep-link them to the printer screen.
 *
 * Every message ends by saying the record itself is safe. A collector who cannot
 * tell "the receipt didn't print" apart from "the payment didn't save" will
 *  re-enter the payment, and a duplicate collection is a worse outcome than a
 * missing receipt.
 */
export function usePrint() {
  const router = useRouter();
  const [printing, setPrinting] = useState(false);

  const print = useCallback(
    async (job: () => Promise<void>) => {
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
              {
                text: 'Printer settings',
                onPress: () => router.push('/collector/more/printer'),
              },
            ]
          );
          return;
        }

        await job();
      } catch {
        Alert.alert(
          'Could not print',
          'The printer did not respond. Check that it is switched on, has paper, and is within range, then try again.\n\nThe record is saved on this phone either way.',
          [{ text: 'OK' }]
        );
      } finally {
        setPrinting(false);
      }
    },
    [router]
  );

  return { print, printing };
}
