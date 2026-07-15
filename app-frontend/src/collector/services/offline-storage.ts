import AsyncStorage from '@react-native-async-storage/async-storage';

interface MeterReading {
  id: string;
  routeId: string;
  collectorId: string;
  accountNumber: string;
  previousReading: number;
  currentReading: number;
  consumption: number;
  readingDate: string;
  timestamp: number;
  synced: boolean;
}

interface Collection {
  id: string;
  collectorId: string;
  accountNumber: string;
  amount: number;
  paymentMethod: 'cash' | 'check' | 'electronic';
  collectionDate: string;
  timestamp: number;
  synced: boolean;
}

interface ServiceOrder {
  id: string;
  type: 'reconnection' | 'disconnection';
  accountNumber: string;
  accountAddress: string;
  reason: string;
  status: 'pending' | 'completed' | 'cancelled';
  fieldVerification?: string;
  completionDate?: string;
  timestamp: number;
  synced: boolean;
}

interface SyncQueueItem {
  type: 'meter_reading' | 'collection' | 'service_order';
  data: any;
  timestamp: number;
}

const STORAGE_KEYS = {
  METER_READINGS: '@collector_meter_readings',
  COLLECTIONS: '@collector_collections',
  SERVICE_ORDERS: '@collector_service_orders',
  SYNC_QUEUE: '@collector_sync_queue',
  LAST_SYNC: '@collector_last_sync',
};

export class OfflineStorage {
  // Meter Readings
  static async saveMeterReading(reading: MeterReading): Promise<void> {
    try {
      const existing = await this.getMeterReadings();
      existing.push(reading);
      await AsyncStorage.setItem(STORAGE_KEYS.METER_READINGS, JSON.stringify(existing));
      
      // Add to sync queue
      await this.addToSyncQueue({
        type: 'meter_reading',
        data: reading,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('Error saving meter reading:', error);
      throw error;
    }
  }

  static async getMeterReadings(): Promise<MeterReading[]> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.METER_READINGS);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error getting meter readings:', error);
      return [];
    }
  }

  static async getUnsyncedMeterReadings(): Promise<MeterReading[]> {
    const readings = await this.getMeterReadings();
    return readings.filter(r => !r.synced);
  }

  static async markMeterReadingSynced(id: string): Promise<void> {
    try {
      const readings = await this.getMeterReadings();
      const updated = readings.map(r => 
        r.id === id ? { ...r, synced: true } : r
      );
      await AsyncStorage.setItem(STORAGE_KEYS.METER_READINGS, JSON.stringify(updated));
    } catch (error) {
      console.error('Error marking meter reading synced:', error);
      throw error;
    }
  }

  // Collections
  static async saveCollection(collection: Collection): Promise<void> {
    try {
      const existing = await this.getCollections();
      existing.push(collection);
      await AsyncStorage.setItem(STORAGE_KEYS.COLLECTIONS, JSON.stringify(existing));
      
      // Add to sync queue
      await this.addToSyncQueue({
        type: 'collection',
        data: collection,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('Error saving collection:', error);
      throw error;
    }
  }

  static async getCollections(): Promise<Collection[]> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.COLLECTIONS);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error getting collections:', error);
      return [];
    }
  }

  static async getUnsyncedCollections(): Promise<Collection[]> {
    const collections = await this.getCollections();
    return collections.filter(c => !c.synced);
  }

  static async markCollectionSynced(id: string): Promise<void> {
    try {
      const collections = await this.getCollections();
      const updated = collections.map(c => 
        c.id === id ? { ...c, synced: true } : c
      );
      await AsyncStorage.setItem(STORAGE_KEYS.COLLECTIONS, JSON.stringify(updated));
    } catch (error) {
      console.error('Error marking collection synced:', error);
      throw error;
    }
  }

  // Service Orders
  static async saveServiceOrder(order: ServiceOrder): Promise<void> {
    try {
      const existing = await this.getServiceOrders();
      existing.push(order);
      await AsyncStorage.setItem(STORAGE_KEYS.SERVICE_ORDERS, JSON.stringify(existing));
      
      // Add to sync queue
      await this.addToSyncQueue({
        type: 'service_order',
        data: order,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('Error saving service order:', error);
      throw error;
    }
  }

  static async getServiceOrders(): Promise<ServiceOrder[]> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.SERVICE_ORDERS);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error getting service orders:', error);
      return [];
    }
  }

  static async getUnsyncedServiceOrders(): Promise<ServiceOrder[]> {
    const orders = await this.getServiceOrders();
    return orders.filter(o => !o.synced);
  }

  static async markServiceOrderSynced(id: string): Promise<void> {
    try {
      const orders = await this.getServiceOrders();
      const updated = orders.map(o => 
        o.id === id ? { ...o, synced: true } : o
      );
      await AsyncStorage.setItem(STORAGE_KEYS.SERVICE_ORDERS, JSON.stringify(updated));
    } catch (error) {
      console.error('Error marking service order synced:', error);
      throw error;
    }
  }

  // Sync Queue
  static async addToSyncQueue(item: SyncQueueItem): Promise<void> {
    try {
      const queue = await this.getSyncQueue();
      queue.push(item);
      await AsyncStorage.setItem(STORAGE_KEYS.SYNC_QUEUE, JSON.stringify(queue));
    } catch (error) {
      console.error('Error adding to sync queue:', error);
      throw error;
    }
  }

  static async getSyncQueue(): Promise<SyncQueueItem[]> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.SYNC_QUEUE);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error getting sync queue:', error);
      return [];
    }
  }

  static async clearSyncQueue(): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.SYNC_QUEUE, JSON.stringify([]));
    } catch (error) {
      console.error('Error clearing sync queue:', error);
      throw error;
    }
  }

  // Last Sync
  static async getLastSyncTimestamp(): Promise<number> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.LAST_SYNC);
      return data ? parseInt(data) : 0;
    } catch (error) {
      console.error('Error getting last sync timestamp:', error);
      return 0;
    }
  }

  static async updateLastSyncTimestamp(): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.LAST_SYNC, Date.now().toString());
    } catch (error) {
      console.error('Error updating last sync timestamp:', error);
      throw error;
    }
  }

  // Conflict Resolution
  static async resolveConflict(type: string, localData: any, serverData: any): Promise<any> {
    // Simple conflict resolution: server wins for most cases
    // This can be enhanced based on business requirements
    return serverData;
  }

  // Clear all data (for testing or logout)
  static async clearAllData(): Promise<void> {
    try {
      await AsyncStorage.removeItem(STORAGE_KEYS.METER_READINGS);
      await AsyncStorage.removeItem(STORAGE_KEYS.COLLECTIONS);
      await AsyncStorage.removeItem(STORAGE_KEYS.SERVICE_ORDERS);
      await AsyncStorage.removeItem(STORAGE_KEYS.SYNC_QUEUE);
      await AsyncStorage.removeItem(STORAGE_KEYS.LAST_SYNC);
    } catch (error) {
      console.error('Error clearing all data:', error);
      throw error;
    }
  }
}
