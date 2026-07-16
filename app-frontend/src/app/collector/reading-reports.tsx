import { ScrollView, StyleSheet } from 'react-native';
import { useState } from 'react';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { PrinterService } from '@/collector/services/printer-service';
import { FilterChips } from '@/shared/components/filter-chips';
import { ListEmpty } from '@/shared/components/list-states';
import { ScreenHeader } from '@/shared/components/screen-header';
import { SyncBadge } from '@/shared/components/status-badge';
import { TwdButton } from '@/shared/components/twd-button';
import { useContentInsetsWithTopSpacing } from '@/shared/hooks/use-content-insets';
import { usePrint } from '@/shared/hooks/use-print';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';

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
  const insets = useContentInsetsWithTopSpacing();
  const theme = useTheme();
  const twd = useTwdTheme();
  const { print, printing } = usePrint();

  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [readings] = useState<MeterReading[]>(mockReadings);

  const selectedRoute = mockRoutes.find((r) => r.id === selectedRouteId) ?? null;
  const filteredReadings = selectedRouteId
    ? readings.filter((r) => r.routeId === selectedRouteId)
    : readings;

  const totalConsumption = filteredReadings.reduce((sum, r) => sum + r.consumption, 0);
  const syncedCount = filteredReadings.filter((r) => r.synced).length;
  const unsyncedCount = filteredReadings.length - syncedCount;

  return (
    <ScrollView
      style={[styles.scrollView, { backgroundColor: theme.background }]}
      contentContainerStyle={[styles.contentContainer, insets]}>
      <ThemedView style={styles.container}>
        <ScreenHeader title="Readings" subtitle="Meter readings by route" />

        <ThemedView style={styles.routeSelector}>
          <ThemedText type="defaultBold" style={styles.sectionTitle}>
            Route
          </ThemedText>
          <FilterChips
            chips={mockRoutes.map((r) => ({ id: r.id, label: r.name }))}
            selectedId={selectedRouteId}
            onSelect={setSelectedRouteId}
            allLabel="All Routes"
            accessibilityLabel="Filter readings by route"
          />
        </ThemedView>

        {/* 2×2, not four across: four tiles in one row left each number ~60px of
            width, and these carry values like "1,285 m³". */}
        <ThemedView style={styles.summaryContainer}>
          <ThemedView type="backgroundElement" style={styles.summaryCard}>
            <ThemedText type="small" themeColor="textSecondary">
              Readings
            </ThemedText>
            <ThemedText style={styles.summaryNumber} numberOfLines={1}>
              {filteredReadings.length}
            </ThemedText>
          </ThemedView>
          <ThemedView type="backgroundElement" style={styles.summaryCard}>
            <ThemedText type="small" themeColor="textSecondary">
              Consumption
            </ThemedText>
            <ThemedText style={styles.summaryNumber} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {totalConsumption} m³
            </ThemedText>
          </ThemedView>
          <ThemedView type="backgroundElement" style={styles.summaryCard}>
            <ThemedText type="small" themeColor="textSecondary">
              Synced
            </ThemedText>
            <ThemedText style={[styles.summaryNumber, { color: twd.success }]} numberOfLines={1}>
              {syncedCount}
            </ThemedText>
          </ThemedView>
          <ThemedView type="backgroundElement" style={styles.summaryCard}>
            <ThemedText type="small" themeColor="textSecondary">
              Pending sync
            </ThemedText>
            <ThemedText style={[styles.summaryNumber, { color: twd.warning }]} numberOfLines={1}>
              {unsyncedCount}
            </ThemedText>
          </ThemedView>
        </ThemedView>

        <ThemedView style={styles.actionsContainer}>
          <TwdButton
            label="Print Report"
            icon="printer"
            busy={printing}
            busyLabel="Printing…"
            onPress={() =>
              void print(() =>
                PrinterService.printReadingReport(filteredReadings, selectedRoute?.id ?? 'ALL')
              )
            }
            accessibilityHint="Prints the readings shown to the thermal printer"
          />
        </ThemedView>

        <ThemedView style={styles.readingsWrapper}>
          <ThemedText type="defaultBold" style={styles.sectionTitle}>
            Meter Readings
          </ThemedText>

          {filteredReadings.length === 0 && (
            <ListEmpty
              icon="gauge"
              title="No readings for this route yet"
              body={
                selectedRoute
                  ? `Nothing recorded on ${selectedRoute.name} today. Readings you record are saved on this phone straight away, with or without signal.`
                  : 'Nothing recorded yet today. Readings you record are saved on this phone straight away, with or without signal.'
              }
            />
          )}

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
                <SyncBadge status={reading.synced ? 'synced' : 'pending'} />
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
                  <ThemedText type="defaultBold">{reading.consumption} m³</ThemedText>
                </ThemedView>
              </ThemedView>

              <ThemedView style={[styles.cardFooter, { borderTopColor: twd.border }]}>
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
  routeSelector: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  sectionTitle: {
    fontSize: 16,
    marginBottom: Spacing.two,
  },
  summaryContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  summaryCard: {
    flexGrow: 1,
    flexBasis: '45%',
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.one,
    alignItems: 'center',
  },
  // fontSize with its own lineHeight — the previous version used type="title"
  // (lineHeight 52) with a fontSize-only override, the same orphaned-metrics bug
  // that produced the overlapping currency tiles elsewhere.
  summaryNumber: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
  },
  actionsContainer: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
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
  },
});
