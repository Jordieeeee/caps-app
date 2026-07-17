import { Platform } from 'react-native';
import BlePlx from 'react-native-ble-plx';

import {
  formatNoticeLines,
  formatReceiptLines,
  type ReceiptInvoice,
  type RouteAccount,
  type ServiceNotice,
} from '@/shared/utils/billing-calculator';

import { chunk, encodeReceipt, toBase64 } from './escpos';
import { PrinterStore } from './printer-state';

export interface PrintData {
  type: 'receipt' | 'report' | 'collection' | 'service_order';
  title: string;
  content: string[];
  footer?: string;
}

export class PrinterService {
  private static bleManager: BlePlx.BleManager | null = null;
  private static connectedDevice: BlePlx.Device | null = null;
  private static disconnectSub: BlePlx.Subscription | null = null;
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

  // Initialize BLE Manager
  static initialize(): void {
    if (!this.bleManager) {
      this.bleManager = new BlePlx.BleManager();
    }
  }

  // Get BLE Manager instance
  static getBleManager(): BlePlx.BleManager | null {
    return this.bleManager;
  }

  // Scan for printers
  static async scanForPrinters(durationSeconds: number = 10): Promise<BlePlx.Device[]> {
    if (!this.bleManager) {
      this.initialize();
    }

    const devices: BlePlx.Device[] = [];
    
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

  // Print collection receipt
  static async printCollectionReceipt(collection: any): Promise<void> {
    const printData: PrintData = {
      type: 'receipt',
      title: 'PAYMENT RECEIPT',
      content: [
        `Account: ${collection.accountNumber}`,
        `Amount: ₱${collection.amount.toFixed(2)}`,
        `Method: ${collection.paymentMethod.toUpperCase()}`,
        `Date: ${collection.collectionDate}`,
        `Collector: ${collection.collectorId}`,
        `Receipt ID: ${collection.id}`,
      ],
      footer: 'Official Payment Receipt',
    };

    await this.print(printData);
  }

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
