import { Platform } from 'react-native';

/**
 * Types only — `import type` is erased at compile time and emits no `require`.
 *
 * This is load-bearing. `react-native-ble-plx` is a native module that Expo Go
 * does not bundle and cannot load, so a *value* import here is evaluated the
 * moment anything reaches this file and takes the whole app down at startup
 * — not at the point someone tries to print. Keeping the types static and the
 * module lazy is what lets the rest of the app run under Expo Go.
 */
import type { BleManager, Device, Subscription } from 'react-native-ble-plx';

import {
  formatNoticeLines,
  formatReceiptLines,
  type ReceiptInvoice,
  type RouteAccount,
  type ServiceNotice,
} from '@/shared/utils/billing-calculator';

import { chunk, encodeReceipt, toBase64 } from './escpos';
import { PrinterStore } from './printer-state';

/**
 * What a collector is told when the native BLE module is missing.
 *
 * Names the cause, because the alternative — "printer not found" — sends someone
 * hunting for a hardware fault that does not exist. In Expo Go there is no radio to
 * find, and no amount of switching the PT-210 off and on will change that.
 */
export const BLE_UNAVAILABLE_MESSAGE =
  'Receipt printing needs a development build of the app. Expo Go cannot use Bluetooth, ' +
  'so the printer is unavailable here — everything else works normally.';

/** Resolved once; `undefined` means "not attempted yet", `null` means "unavailable". */
let bleModule: typeof import('react-native-ble-plx') | null | undefined;

/**
 * Load the native module, or return null where it does not exist.
 *
 * `require` rather than `import` on purpose: it has to run at call time, inside a
 * try, so a missing native module is a value we can branch on instead of a startup
 * crash.
 */
function loadBle(): typeof import('react-native-ble-plx') | null {
  if (bleModule !== undefined) return bleModule;
  let loaded: typeof import('react-native-ble-plx') | null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = require('react-native-ble-plx');
  } catch {
    loaded = null;
  }
  bleModule = loaded;
  return loaded;
}

/**
 * Whether this build can print at all.
 *
 * Screens call this to disable print affordances up front. A print button that
 * always fails is worse than no button: the collector taps it in front of a
 * consumer who is waiting for a receipt.
 */
export function isPrintingSupported(): boolean {
  return loadBle() !== null;
}

export interface PrintData {
  type: 'receipt' | 'report' | 'collection' | 'service_order';
  title: string;
  content: string[];
  footer?: string;
}

export class PrinterService {
  private static bleManager: BleManager | null = null;
  private static connectedDevice: Device | null = null;
  private static disconnectSub: Subscription | null = null;
  private static readonly PRINTER_SERVICE_UUID = '000018F0-0000-1000-8000-00805F9B34FB';
  private static readonly PRINTER_CHARACTERISTIC_UUID = '00002AF1-0000-1000-8000-00805F9B34FB';

  /**
   * Bytes per BLE write.
   *
   * 20 is what a 23-byte default ATT MTU leaves after the 3-byte header, and it is
   * the only figure safe to assume before negotiation. `connectToDevice` raises it
   * when the platform allows.
   */
  private static chunkSize = 20;

  /**
   * Milliseconds between writes.
   *
   * The PT-210's receive buffer is small and it does not apply backpressure over
   * BLE — an unacknowledged write that arrives while the buffer is full is
   * dropped, silently, and the receipt comes out with a hole in the middle. This
   * is the crudest possible flow control and it is what these units need.
   */
  private static readonly WRITE_DELAY_MS = 20;

  /**
   * Initialize the BLE manager.
   *
   * Throws where the native module is absent (Expo Go) rather than leaving
   * `bleManager` null for a later `this.bleManager!` to dereference — the old
   * non-null assertions in scan/connect would have produced a bare
   * "undefined is not an object", which tells the collector nothing.
   */
  static initialize(): void {
    if (this.bleManager) return;
    const ble = loadBle();
    if (!ble) throw new Error(BLE_UNAVAILABLE_MESSAGE);
    // Named export under CommonJS interop; fall back to default for safety.
    const Manager = ble.BleManager ?? (ble as { default?: { BleManager?: typeof BleManager } }).default?.BleManager;
    if (!Manager) throw new Error(BLE_UNAVAILABLE_MESSAGE);
    this.bleManager = new Manager();
  }

  // Get BLE Manager instance
  static getBleManager(): BleManager | null {
    return this.bleManager;
  }

  // Scan for printers
  static async scanForPrinters(durationSeconds: number = 10): Promise<Device[]> {
    if (!this.bleManager) {
      this.initialize();
    }

    const devices: Device[] = [];
    
    return new Promise((resolve, reject) => {
      this.bleManager!.startDeviceScan(
        null,
        { allowDuplicates: false },
        (error, device) => {
          if (error) {
            // startDeviceScan returns Promise<void>, not a subscription — stopping
            // the scan is how you unsubscribe from it.
            this.bleManager!.stopDeviceScan();
            reject(error);
            return;
          }

          if (device && device.name) {
            // Filter for thermal printers (common names)
            const printerKeywords = ['PT-210', 'GOOJPRT', 'Printer', 'Thermal'];
            const isPrinter = printerKeywords.some(keyword => 
              device.name?.toUpperCase().includes(keyword.toUpperCase())
            );

            if (isPrinter && !devices.find(d => d.id === device.id)) {
              devices.push(device);
            }
          }
        }
      );

      // Stop scanning after duration
      setTimeout(() => {
        this.bleManager!.stopDeviceScan();
        resolve(devices);
      }, durationSeconds * 1000);
    });
  }

  // Connect to printer
  static async connectToDevice(deviceId: string): Promise<void> {
    if (!this.bleManager) {
      this.initialize();
    }

    PrinterStore.set({ status: 'connecting', deviceName: null, deviceId });

    try {
      const device = await this.bleManager!.connectToDevice(deviceId);
      await device.discoverAllServicesAndCharacteristics();

      /**
       * Raise the MTU so a receipt is ~40 writes instead of ~370.
       *
       * Android negotiates on request; iOS fixes the MTU at connection time and
       * exposes it read-only, so there is nothing to ask for there. Failure is not
       * fatal — 20-byte writes are slow, not broken — so this never rejects the
       * connection.
       */
      try {
        const negotiated =
          Platform.OS === 'android' ? await device.requestMTU(247) : device;
        if (negotiated.mtu && negotiated.mtu > 23) {
          this.chunkSize = negotiated.mtu - 3;
        }
      } catch {
        this.chunkSize = 20;
      }

      this.connectedDevice = device;

      /**
       * The event nobody was listening for.
       *
       * A BLE peripheral drops for reasons that have nothing to do with the app —
       * the PT-210 is switched off, its battery dies, the collector walks out of
       * range with it in a bag. Without this, `connectedDevice` stayed non-null
       * forever and the UI kept reporting a printer that was not there.
       */
      this.disconnectSub?.remove();
      this.disconnectSub = device.onDisconnected(() => {
        this.connectedDevice = null;
        this.disconnectSub?.remove();
        this.disconnectSub = null;
        PrinterStore.set({ status: 'disconnected', deviceName: null, deviceId: null });
      });

      PrinterStore.set({
        status: 'connected',
        deviceName: device.name ?? 'Thermal printer',
        deviceId: device.id,
      });
    } catch (error) {
      this.connectedDevice = null;
      PrinterStore.set({ status: 'disconnected', deviceName: null, deviceId: null });
      throw error;
    }
  }

  // Disconnect from printer
  static async disconnect(): Promise<void> {
    const device = this.connectedDevice;
    this.disconnectSub?.remove();
    this.disconnectSub = null;
    this.connectedDevice = null;
    // Publish before awaiting: the connection is over as far as this app is
    // concerned, and a cancelConnection that throws must not leave the UI showing
    // a printer we have already stopped tracking.
    PrinterStore.set({ status: 'disconnected', deviceName: null, deviceId: null });

    if (device) {
      try {
        await device.cancelConnection();
      } catch {
        // Already gone. Nothing to undo.
      }
    }
  }

  // Check connection status
  static isConnected(): boolean {
    return this.connectedDevice !== null;
  }

  /**
   * Print already-laid-out lines.
   *
   * The line array is the contract: callers own the 32-column layout (see
   * billing-calculator's formatReceiptLines), this owns getting those exact
   * characters onto paper. Nothing here re-wraps or re-centres — a transport that
   * silently re-flows a receipt is how totals end up on their own page.
   */
  static async printLines(lines: string[]): Promise<void> {
    await this.sendBytes(encodeReceipt(lines));
  }

  // Print data
  static async print(printData: PrintData): Promise<void> {
    const lines: string[] = [this.centerText(printData.title), '', ...printData.content];
    if (printData.footer) lines.push('', this.centerText(printData.footer));
    await this.printLines(lines);
  }

  // Center text (approximate for thermal printer)
  private static centerText(text: string): string {
    const lineLength = 32; // Standard thermal printer width
    const padding = Math.floor((lineLength - text.length) / 2);
    return ' '.repeat(Math.max(0, padding)) + text;
  }

  /**
   * Write the byte stream to the printer characteristic.
   *
   * This method used to be a `console.log` and a commented-out sketch under a
   * `TODO: Implement actual BLE write`, wrapped in a try/catch that could not
   * throw. Every print in the app therefore *resolved successfully* and produced
   * no paper: the collector saw "Printing…" turn back into a button, the record
   * saved, and the consumer standing in front of them got nothing. A failure that
   * reports success is worse than a crash, because nobody goes looking for it.
   *
   * Written without response — the PT-210's characteristic (0x2AF1) is
   * write-without-response only, and an acknowledged write to it fails outright on
   * some firmware. That means the transport cannot tell us the printer consumed
   * the bytes; the only real acknowledgement is paper, which is why usePrint's
   * failure copy asks the collector to look at the printer rather than claiming
   * the job is done.
   */
  private static async sendBytes(bytes: number[]): Promise<void> {
    const device = this.connectedDevice;
    if (!device) {
      throw new Error('No printer connected');
    }

    for (const part of chunk(bytes, this.chunkSize)) {
      await device.writeCharacteristicWithoutResponseForService(
        this.PRINTER_SERVICE_UUID,
        this.PRINTER_CHARACTERISTIC_UUID,
        toBase64(part)
      );
      await new Promise((resolve) => setTimeout(resolve, this.WRITE_DELAY_MS));
    }
  }

  /**
   * The consumer's water bill — the receipt this whole flow exists to produce.
   *
   * Layout comes from billing-calculator so that the printed document and the
   * on-screen preview are generated from one source. The previous
   * `printMeterReadingReceipt` printed seven unpriced lines ("Account / Previous /
   * Current / Consumption") with no charge, no VAT, and no amount due — a meter
   * reading slip, not an invoice. Nobody can pay against it.
   */
  static async printInvoice(invoice: ReceiptInvoice, account: RouteAccount): Promise<void> {
    await this.printLines(formatReceiptLines(invoice, account));
  }

  /** The reconnection/disconnection slip handed over at the gate. */
  static async printServiceNotice(notice: ServiceNotice): Promise<void> {
    await this.printLines(formatNoticeLines(notice));
  }

  /**
   * `printCollectionReceipt` is gone, and could not have been kept.
   *
   * It printed a document headed "PAYMENT RECEIPT" and footed "Official Payment
   * Receipt", against a payment this app has never been able to record — nothing
   * ever called it, and nothing ever called `saveCollection` either. TWD's
   * collectors read meters; a consumer pays at the office. An official receipt for
   * money nobody took is not a feature with no users, it is a document that should
   * not exist.
   *
   * It was also unprintable as written: `₱` is not in the PT-210's character set
   * (see TRANSLITERATE in escpos.ts), so the amount would have printed as `?486.00`
   * on the one line where the figure has to be unambiguous.
   */

  // `printServiceOrderReceipt` and `printReadingReport` were removed with the
  // screens that called them. The first printed an untitled order stub with no
  // statement of what had happened to the water; the second printed an internal
  // route summary. Reconnections and disconnections now print through
  // `printServiceNotice`, which says the thing the consumer needs to read.

  // Cleanup
  static destroy(): void {
    this.disconnectSub?.remove();
    this.disconnectSub = null;
    if (this.bleManager) {
      this.bleManager.destroy();
      this.bleManager = null;
    }
    this.connectedDevice = null;
    PrinterStore.set({ status: 'disconnected', deviceName: null, deviceId: null });
  }
}
