import { Platform, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState } from 'react';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { OfflineStorage } from '@/collector/services/offline-storage';
import { PrinterService } from '@/collector/services/printer-service';

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

interface Route {
  id: string;
  name: string;
  area: string;
  totalAccounts: number;
}

const mockRoutes: Route[] = [
  { id: 'R1', name: 'Downtown Route', area: 'Central Business District', totalAccounts: 150 },
  { id: 'R2', name: 'Residential North', area: 'North Subdivision', totalAccounts: 200 },
  { id: 'R3', name: 'Industrial Zone', area: 'Industrial Park', totalAccounts: 75 },
];

const mockReadings: MeterReading[] = [
  {
    id: '1',
    routeId: 'R1',
    collectorId: 'COL-001',
    accountNumber: 'WD-12345',
    previousReading: 1250,
    currentReading: 1285,
    consumption: 35,
    readingDate: '2025-07-15',
    timestamp: Date.now(),
    synced: false,
  },
  {
    id: '2',
    routeId: 'R1',
    collectorId: 'COL-001',
    accountNumber: 'WD-12346',
    previousReading: 980,
    currentReading: 1015,
    consumption: 35,
    readingDate: '2025-07-15',
    timestamp: Date.now(),
    synced: false,
  },
  {
    id: '3',
    routeId: 'R1',
    collectorId: 'COL-001',
    accountNumber: 'WD-12347',
    previousReading: 1450,
    currentReading: 1480,
    consumption: 30,
    readingDate: '2025-07-15',
    timestamp: Date.now(),
    synced: true,
  },
];

export default function ReadingReportsScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const insets = {
    ...safeAreaInsets,
    bottom: safeAreaInsets.bottom + BottomTabInset + Spacing.three,
  };
  const theme = useTheme();
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);
  const [readings, setReadings] = useState<MeterReading[]>(mockReadings);

  const contentPlatformStyle = Platform.select({
    android: {
      paddingTop: insets.top,
      paddingLeft: insets.left,
      paddingRight: insets.right,
      paddingBottom: insets.bottom,
    },
    web: {
      paddingTop: Spacing.six,
      paddingBottom: Spacing.four,
    },
  });

  const filteredReadings = selectedRoute
    ? readings.filter(r => r.routeId === selectedRoute.id)
    : readings;

  const totalConsumption = filteredReadings.reduce((sum, r) => sum + r.consumption, 0);
  const syncedCount = filteredReadings.filter(r => r.synced).length;
  const unsyncedCount = filteredReadings.length - syncedCount;

  const handlePrintReport = async () => {
    try {
      await PrinterService.printReadingReport(
        filteredReadings,
        selectedRoute?.id || 'ALL'
      );
    } catch (error) {
      console.error('Error printing report:', error);
    }
  };

  return (
    <ScrollView
      style={[styles.scrollView, { backgroundColor: theme.background }]}
      contentInset={insets}
      contentContainerStyle={[styles.contentContainer, contentPlatformStyle]}>
      <ThemedView style={styles.container}>
        <ThemedView style={styles.titleContainer}>
          <ThemedText type="subtitle">Reading Reports</ThemedText>
          <ThemedText style={styles.centerText} themeColor="textSecondary">
            Generate and view meter reading reports per route and collector.
          </ThemedText>
        </ThemedView>

        <ThemedView style={styles.routeSelector}>
          <ThemedText type="defaultBold" style={styles.sectionTitle}>
            Select Route
          </ThemedText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.routeScroll}>
            <TouchableOpacity
              style={[
                styles.routeChip,
                !selectedRoute && { backgroundColor: theme.backgroundElement },
              ]}
              onPress={() => setSelectedRoute(null)}>
              <ThemedText type="small">All Routes</ThemedText>
            </TouchableOpacity>
            {mockRoutes.map((route) => (
              <TouchableOpacity
                key={route.id}
                style={[
                  styles.routeChip,
                  selectedRoute?.id === route.id && {
                    backgroundColor: theme.backgroundElement,
                  },
                ]}
                onPress={() => setSelectedRoute(route)}>
                <ThemedText type="small">{route.name}</ThemedText>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </ThemedView>

        <ThemedView style={styles.summaryContainer}>
          <ThemedView type="backgroundElement" style={styles.summaryCard}>
            <ThemedText type="small" themeColor="textSecondary">
              Total Readings
            </ThemedText>
            <ThemedText type="title" style={styles.summaryNumber}>
              {filteredReadings.length}
            </ThemedText>
          </ThemedView>
          <ThemedView type="backgroundElement" style={styles.summaryCard}>
            <ThemedText type="small" themeColor="textSecondary">
              Total Consumption
            </ThemedText>
            <ThemedText type="title" style={styles.summaryNumber}>
              {totalConsumption} m³
            </ThemedText>
          </ThemedView>
          <ThemedView type="backgroundElement" style={styles.summaryCard}>
            <ThemedText type="small" themeColor="textSecondary">
              Synced
            </ThemedText>
            <ThemedText type="title" style={[styles.summaryNumber, { color: '#34C759' }]}>
              {syncedCount}
            </ThemedText>
          </ThemedView>
          <ThemedView type="backgroundElement" style={styles.summaryCard}>
            <ThemedText type="small" themeColor="textSecondary">
              Pending Sync
            </ThemedText>
            <ThemedText type="title" style={[styles.summaryNumber, { color: '#FF9500' }]}>
              {unsyncedCount}
            </ThemedText>
          </ThemedView>
        </ThemedView>

        <ThemedView style={styles.actionsContainer}>
          <TouchableOpacity
            style={[styles.printButton, { backgroundColor: theme.backgroundElement }]}
            onPress={handlePrintReport}>
            <ThemedText type="defaultBold">🖨️ Print Report</ThemedText>
          </TouchableOpacity>
        </ThemedView>

        <ThemedView style={styles.readingsWrapper}>
          <ThemedText type="defaultBold" style={styles.sectionTitle}>
            Meter Readings
          </ThemedText>
          {filteredReadings.map((reading) => (
            <ThemedView key={reading.id} type="backgroundElement" style={styles.readingCard}>
              <ThemedView style={styles.cardHeader}>
                <ThemedView style={styles.headerText}>
                  <ThemedText type="defaultBold" style={styles.cardTitle}>
                    {reading.accountNumber}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {reading.readingDate}
                  </ThemedText>
                </ThemedView>
                <ThemedView
                  style={[
                    styles.syncBadge,
                    {
                      backgroundColor: reading.synced ? '#34C75920' : '#FF950020',
                    },
                  ]}>
                  <ThemedText
                    type="small"
                    style={[
                      styles.syncText,
                      { color: reading.synced ? '#34C759' : '#FF9500' },
                    ]}>
                    {reading.synced ? 'SYNCED' : 'PENDING'}
                  </ThemedText>
                </ThemedView>
              </ThemedView>
              <ThemedView style={styles.readingDetails}>
                <ThemedView style={styles.detailRow}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Previous
                  </ThemedText>
                  <ThemedText type="defaultBold">{reading.previousReading}</ThemedText>
                </ThemedView>
                <ThemedView style={styles.detailRow}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Current
                  </ThemedText>
                  <ThemedText type="defaultBold">{reading.currentReading}</ThemedText>
                </ThemedView>
                <ThemedView style={styles.detailRow}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Consumption
                  </ThemedText>
                  <ThemedText type="defaultBold" style={{ color: '#007AFF' }}>
                    {reading.consumption} m³
                  </ThemedText>
                </ThemedView>
              </ThemedView>
              <ThemedView style={styles.cardFooter}>
                <ThemedText type="small" themeColor="textSecondary">
                  Route: {reading.routeId} | Collector: {reading.collectorId}
                </ThemedText>
              </ThemedView>
            </ThemedView>
          ))}
        </ThemedView>
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  container: {
    maxWidth: MaxContentWidth,
    flexGrow: 1,
  },
  titleContainer: {
    gap: Spacing.three,
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.six,
  },
  centerText: {
    textAlign: 'center',
  },
  routeSelector: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  sectionTitle: {
    fontSize: 16,
    marginBottom: Spacing.two,
  },
  routeScroll: {
    flexDirection: 'row',
  },
  routeChip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
    marginRight: Spacing.two,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  summaryContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  summaryCard: {
    borderRadius: Spacing.three,
    padding: Spacing.four,
    alignItems: 'center',
    minWidth: 100,
  },
  summaryNumber: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  actionsContainer: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  printButton: {
    borderRadius: Spacing.three,
    padding: Spacing.four,
    alignItems: 'center',
  },
  readingsWrapper: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  readingCard: {
    borderRadius: Spacing.three,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  headerText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
  },
  syncBadge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.two,
  },
  syncText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  readingDetails: {
    gap: Spacing.two,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cardFooter: {
    paddingTop: Spacing.two,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
});
