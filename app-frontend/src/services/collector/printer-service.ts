import { Platform } from 'react-native';
import BlePlx from 'react-native-ble-plx';

export interface PrintData {
  type: 'receipt' | 'report' | 'collection' | 'service_order';
  title: string;
  content: string[];
  footer?: string;
}

export class PrinterService {
  private static bleManager: BlePlx.BleManager | null = null;
  private static connectedDevice: BlePlx.Device | null = null;
  private static readonly PRINTER_SERVICE_UUID = '000018F0-0000-1000-8000-00805F9B34FB';
  private static readonly PRINTER_CHARACTERISTIC_UUID = '00002AF1-0000-1000-8000-00805F9B34FB';

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
      const subscription = this.bleManager!.startDeviceScan(
        null,
        { allowDuplicates: false },
        (error, device) => {
          if (error) {
            subscription.remove();
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
        subscription.remove();
        this.bleManager!.stopDeviceScan();
        resolve(devices);
      }, durationSeconds * 1000);
    });
  }

  // Connect to printer
  static async connectToDevice(deviceId: string): Promise<void> {
    if (!this.bleManager) {
      throw new Error('BLE Manager not initialized');
    }

    try {
      const device = await this.bleManager.connectToDevice(deviceId);
      await device.discoverAllServicesAndCharacteristics();
      
      this.connectedDevice = device;
      console.log('Connected to printer:', device.name);
    } catch (error) {
      console.error('Error connecting to printer:', error);
      throw error;
    }
  }

  // Disconnect from printer
  static async disconnect(): Promise<void> {
    if (this.connectedDevice) {
      try {
        await this.connectedDevice.cancelConnection();
        this.connectedDevice = null;
        console.log('Disconnected from printer');
      } catch (error) {
        console.error('Error disconnecting from printer:', error);
        throw error;
      }
    }
  }

  // Check connection status
  static isConnected(): boolean {
    return this.connectedDevice !== null;
  }

  // Print data
  static async print(printData: PrintData): Promise<void> {
    if (!this.connectedDevice) {
      throw new Error('No printer connected');
    }

    try {
      // Format print data for thermal printer
      const formattedData = this.formatPrintData(printData);
      
      // Send data to printer
      await this.sendDataToPrinter(formattedData);
      
      console.log('Print job completed');
    } catch (error) {
      console.error('Error printing:', error);
      throw error;
    }
  }

  // Format data for thermal printer
  private static formatPrintData(printData: PrintData): string {
    let output = '';

    // Center and bold title
    output += this.centerText(printData.title);
    output += '\n\n';

    // Add content
    printData.content.forEach(line => {
      output += line + '\n';
    });

    // Add footer if provided
    if (printData.footer) {
      output += '\n' + this.centerText(printData.footer);
    }

    // Add cut command and feed
    output += '\n\n\n';

    return output;
  }

  // Center text (approximate for thermal printer)
  private static centerText(text: string): string {
    const lineLength = 32; // Standard thermal printer width
    const padding = Math.floor((lineLength - text.length) / 2);
    return ' '.repeat(Math.max(0, padding)) + text;
  }

  // Send data to printer via BLE
  private static async sendDataToPrinter(data: string): Promise<void> {
    if (!this.connectedDevice) {
      throw new Error('No printer connected');
    }

    try {
      // Convert string to bytes
      const encoder = new TextEncoder();
      const bytes = encoder.encode(data);

      // Write to printer characteristic
      // Note: This is a simplified implementation
      // Actual implementation may need specific UUIDs and data formatting
      console.log('Sending data to printer:', data);
      
      // TODO: Implement actual BLE write
      // const services = await this.connectedDevice.services();
      // const printerService = services.find(s => s.uuid === this.PRINTER_SERVICE_UUID);
      // if (printerService) {
      //   const characteristics = await printerService.characteristics();
      //   const writeCharacteristic = characteristics.find(
      //     c => c.uuid === this.PRINTER_CHARACTERISTIC_UUID
      //   );
      //   if (writeCharacteristic) {
      //     await writeCharacteristic.writeWithoutResponse(bytes);
      //   }
      // }
    } catch (error) {
      console.error('Error sending data to printer:', error);
      throw error;
    }
  }

  // Print meter reading receipt
  static async printMeterReadingReceipt(reading: any): Promise<void> {
    const printData: PrintData = {
      type: 'receipt',
      title: 'METER READING',
      content: [
        `Account: ${reading.accountNumber}`,
        `Previous: ${reading.previousReading}`,
        `Current: ${reading.currentReading}`,
        `Consumption: ${reading.consumption}`,
        `Date: ${reading.readingDate}`,
        `Collector: ${reading.collectorId}`,
        `Route: ${reading.routeId}`,
      ],
      footer: 'Thank you for your service',
    };

    await this.print(printData);
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

  // Print service order receipt
  static async printServiceOrderReceipt(order: any): Promise<void> {
    const printData: PrintData = {
      type: 'receipt',
      title: `${order.type.toUpperCase()} ORDER`,
      content: [
        `Account: ${order.accountNumber}`,
        `Address: ${order.accountAddress}`,
        `Type: ${order.type.toUpperCase()}`,
        `Status: ${order.status.toUpperCase()}`,
        `Date: ${new Date(order.timestamp).toLocaleDateString()}`,
        `Order ID: ${order.id}`,
      ],
      footer: order.type === 'reconnection' ? 'Service Restored' : 'Service Disconnected',
    };

    await this.print(printData);
  }

  // Print reading report
  static async printReadingReport(readings: any[], routeId: string): Promise<void> {
    const content: string[] = [
      `Route: ${routeId}`,
      `Total Readings: ${readings.length}`,
      `Date: ${new Date().toLocaleDateString()}`,
      '--------------------------------',
    ];

    readings.forEach((reading, index) => {
      content.push(
        `${index + 1}. ${reading.accountNumber}`,
        `   Prev: ${reading.previousReading} Curr: ${reading.currentReading}`,
        `   Cons: ${reading.consumption}`
      );
    });

    const printData: PrintData = {
      type: 'report',
      title: 'READING REPORT',
      content,
      footer: 'End of Report',
    };

    await this.print(printData);
  }

  // Cleanup
  static destroy(): void {
    if (this.bleManager) {
      this.bleManager.destroy();
      this.bleManager = null;
    }
    this.connectedDevice = null;
  }
}
