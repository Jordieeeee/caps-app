import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, type AlertButton } from 'react-native';
import {
  BLE_UNAVAILABLE_MESSAGE,
  PrinterService,
  isPrintingSupported,
} from '@/collector/services/printer-service';
import { usePrinter } from '@/collector/services/printer-state';

/**
 * What happened, in the only terms the caller has to act on.
 *
 * The distinction that matters is `navigated`: the collector asked to go to the
 * printer screen and this hook has already pushed it. A caller that then runs its
 * own `router.back()` would pop that screen straight back off — see the crash note
 * on `ask` below for what that actually did.
 */
export type PrintOutcome =
  /** Paper came out. */
  | 'printed'
  /** Blocked or failed; the collector acknowledged it and is still on this screen. */
  | 'dismissed'
  /** This hook pushed the printer screen. The caller must not touch the navigator. */
  | 'navigated';

interface PrintAlertChoice {
  id: string;
  text: string;
  style?: AlertButton['style'];
}

/**
 * Show an alert and wait for the collector to actually answer it.
 *
 * ⚠️ `Alert.alert` IS FIRE-AND-FORGET, AND THAT IS WHAT CRASHED THE APP.
 *
 * It returns the instant the dialog is on screen, so the line after it runs while
 * the collector is still reading. Every failure path here used to `Alert.alert(…)`
 * and `return`, which resolved `print()` with the dialog still up — and both call
 * sites answer a resolved `print()` with `router.back()`. The screen was therefore
 * popped out from under a dialog whose buttons still held its callbacks: "Try
 * again" re-entered the print flow and called `setPrinting` on an unmounted
 * component, and "Printer settings" pushed a route from a screen that no longer
 * existed. Mutating a tree react-native-screens is concurrently tearing down is
 * what desynchronises Fabric's mounting layer, and it surfaced on device as:
 *
 *     java.lang.IllegalStateException: addViewAt: failed to insert view [5240]
 *       into parent [5246] at index 2
 *     Caused by: The specified child already has a parent.
 *
 * — a stack with nothing of ours in it, and no mention of Bluetooth, for a bug
 * that is entirely about when we navigate.
 *
 * `cancelable: false` matters as much as the promise. On Android a tap outside the
 * dialog dismisses it without pressing any button, which would leave this promise
 * pending forever and hang the print call — a spinner that never stops, in front
 * of a paying customer.
 */
function ask(
  title: string,
  message: string,
  choices: readonly PrintAlertChoice[]
): Promise<string> {
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      choices.map((choice) => ({
        text: choice.text,
        style: choice.style,
        onPress: () => resolve(choice.id),
      })),
      { cancelable: false }
    );
  });
}

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
 * tell "the receipt didn't print" apart from "the reading didn't save" will go
 * back and enter the reading again, and a meter read twice into two records is a
 * worse outcome than a missing receipt.
 */
export function usePrint() {
  const router = useRouter();
  const printer = usePrinter();
  const [printing, setPrinting] = useState(false);

  const print = useCallback(
    async (job: () => Promise<void>): Promise<PrintOutcome> => {
      /**
       * A loop rather than a recursive `attempt()`, so "Try again" re-runs the
       * whole preflight from the SAME call — a printer that failed once may have
       * been switched off, and retrying only `job()` would skip the check that
       * catches it.
       *
       * Recursion did that too, but it did it from an alert callback, which is
       * the half that broke: by the time a collector taps "Try again" the caller
       * has long since navigated away, so the retry ran against a dead screen.
       * Here the retry is just the next turn of a loop the caller is still
       * awaiting, and nothing has navigated yet.
       */
      for (;;) {
        let failure: 'unsupported' | 'bluetoothOff' | 'notConnected' | 'jobFailed' | null = null;

        setPrinting(true);
        try {
          // No Bluetooth in this build at all (Expo Go). Checked before anything
          // touches the manager, and worded so nobody goes looking for a hardware
          // fault that does not exist.
          if (!isPrintingSupported()) {
            failure = 'unsupported';
          } else {
            const manager = PrinterService.getBleManager();
            const bleState = manager ? await manager.state() : null;

            // Compared as a string literal rather than importing ble-plx's `State`
            // enum: an enum is a runtime value, so importing it would re-introduce
            // the static native require this file was just freed from. `State` is a
            // string enum, so 'PoweredOff' is exactly the value it produces.
            if (bleState === 'PoweredOff') {
              failure = 'bluetoothOff';
            } else if (!PrinterService.isConnected()) {
              // Also the path when BLE was never initialised — there is no
              // connection either way, and the printer screen fixes both.
              failure = 'notConnected';
            } else {
              await job();
            }
          }
        } catch {
          failure = 'jobFailed';
        } finally {
          /**
           * Cleared BEFORE any dialog goes up, which is why the alerts live below
           * this block rather than inside it. The button reads "Printing…" while
           * `printing` is true, and leaving it there under a "Could not print"
           * dialog would tell the collector the job was still running at the same
           * moment the app told them it had failed.
           */
          setPrinting(false);
        }

        if (!failure) return 'printed';

        if (failure === 'unsupported') {
          await ask('Printing not available', BLE_UNAVAILABLE_MESSAGE, [{ id: 'ok', text: 'OK' }]);
          return 'dismissed';
        }

        if (failure === 'bluetoothOff') {
          await ask(
            'Bluetooth is off',
            'Turn on Bluetooth in your phone settings, then try printing again.\n\nThe record is saved on this phone either way.',
            [{ id: 'ok', text: 'OK' }]
          );
          return 'dismissed';
        }

        if (failure === 'notConnected') {
          const choice = await ask(
            'No printer connected',
            'Connect the PT-210 thermal printer first: make sure it is switched on, then pick it in printer settings.\n\nThe record is saved on this phone either way.',
            [
              { id: 'cancel', text: 'Cancel', style: 'cancel' },
              { id: 'settings', text: 'Printer settings' },
            ]
          );
          if (choice === 'settings') {
            router.push('/collector/more/printer');
            return 'navigated';
          }
          return 'dismissed';
        }

        // Retry or troubleshoot — the only two things a collector can do about a
        // printer that took the job and produced no paper.
        const choice = await ask(
          'Could not print',
          'The printer did not respond. Check that it is switched on, has paper, and is within range.\n\nThe record is saved on this phone either way.',
          [
            { id: 'ok', text: 'OK', style: 'cancel' },
            { id: 'settings', text: 'Printer settings' },
            { id: 'retry', text: 'Try again' },
          ]
        );

        if (choice === 'settings') {
          router.push('/collector/more/printer');
          return 'navigated';
        }
        if (choice === 'retry') continue;
        return 'dismissed';
      }
    },
    [router]
  );

  return {
    print,
    printing,
    /** False when a Print button should be disabled. */
    canPrint: isPrintingSupported() && printer.status === 'connected',
    /** Short inline reason a Print button is disabled. Null when it isn't. */
    printBlockedReason: !isPrintingSupported()
      ? // Nothing the collector can do on this device, so it does not read as an
        // instruction — "Connect printer to print" would send them to a settings
        // screen that cannot help.
        'Printing needs a development build'
      : printer.status === 'connected'
        ? null
        : printer.status === 'connecting'
          ? 'Connecting to printer…'
          : 'Connect printer to print',
  };
}
