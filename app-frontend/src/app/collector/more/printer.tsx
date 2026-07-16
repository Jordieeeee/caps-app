import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth } from '@/constants/theme';
import { PrinterService } from '@/collector/services/printer-service';
import { Icon } from '@/shared/components/icon';
import { ListEmpty, ListLoading } from '@/shared/components/list-states';
import { TwdButton } from '@/shared/components/twd-button';
import { useStackContentInsets } from '@/shared/hooks/use-content-insets';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { MIN_TAP_TARGET, Radius, Spacing } from '@/shared/theme/twd';

interface FoundPrinter {
  id: string;
  name: string;
}

/**
 * Printer pairing — the screen without which no receipt has ever printed.
 *
 * PrinterService has shipped scan/connect/disconnect methods since day one, and
 * nothing in the UI called any of them: there was no way to connect a PT-210, so
 * every print action on every screen threw "No printer connected". The print
 * *buttons* existed; the flow did not. This screen closes that loop with the
 * service methods that already exist — no new dependency.
 *
 * State here is deliberately screen-local. PrinterService exposes only a boolean
 * `isConnected()`, so the connected printer's name lives in this screen's state
 * from the moment of connection; after an app restart the boolean survives as
 * false anyway (BLE connections don't outlive the process).
 */
export default function PrinterScreen() {
  const theme = useTwdTheme();
  const insets = useStackContentInsets();

  const [connected, setConnected] = useState(PrinterService.isConnected());
  const [connectedName, setConnectedName] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [found, setFound] = useState<FoundPrinter[]>([]);
  const [connectingId, setConnectingId] = useState<string | null>(null);

  const scan = useCallback(async () => {
    setScanning(true);
    setFound([]);
    try {
      PrinterService.initialize();
      const devices = await PrinterService.scanForPrinters(8);
      setFound(devices.map((d) => ({ id: d.id, name: d.name ?? 'Unnamed printer' })));
    } catch {
      Alert.alert(
        'Could not search',
        'Bluetooth search failed. Check that Bluetooth is turned on and that the app is allowed to use it, then try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setScanning(false);
      setHasScanned(true);
    }
  }, []);

  const connect = useCallback(async (printer: FoundPrinter) => {
    setConnectingId(printer.id);
    try {
      await PrinterService.connectToDevice(printer.id);
      setConnected(true);
      setConnectedName(printer.name);
    } catch {
      Alert.alert(
        'Could not connect',
        `${printer.name} did not accept the connection. Make sure it is switched on and close to the phone, then try again.`,
        [{ text: 'OK' }]
      );
    } finally {
      setConnectingId(null);
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      await PrinterService.disconnect();
    } finally {
      // Even if the cancel throws, the connection is not something to keep
      // pretending exists — reflect disconnected and let a reconnect fix it.
      setConnected(false);
      setConnectedName(null);
    }
  }, []);

  return (
    <ThemedView style={styles.root}>
      <ScrollView contentContainerStyle={[styles.scroll, insets]}>
        <View style={styles.content}>
          <View
            style={[
              styles.statusCard,
              connected
                ? { borderColor: theme.success, backgroundColor: theme.backgroundElement }
                : { borderColor: theme.border, backgroundColor: theme.backgroundElement },
            ]}
            accessible
            accessibilityRole="summary">
            <Icon
              name={connected ? 'check' : 'bluetooth'}
              size={24}
              color={connected ? theme.success : theme.textSecondary}
            />
            <View style={styles.statusText}>
              <ThemedText type="defaultBold">
                {connected ? `Connected${connectedName ? ` to ${connectedName}` : ''}` : 'No printer connected'}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {connected
                  ? 'Receipts and reports will print to this printer.'
                  : 'Switch the PT-210 on, then search for it below.'}
              </ThemedText>
            </View>
          </View>

          {connected ? (
            <TwdButton label="Disconnect" variant="danger" onPress={() => void disconnect()} />
          ) : (
            <TwdButton
              label="Search for printers"
              icon="bluetooth"
              busy={scanning}
              busyLabel="Searching…"
              onPress={() => void scan()}
            />
          )}

          {!connected && scanning && <ListLoading label="Searching for nearby printers…" />}

          {!connected && !scanning && hasScanned && found.length === 0 && (
            <ListEmpty
              icon="printer"
              title="No printers found"
              body="Check that the PT-210 is switched on and within a few metres, then search again."
              action={{ label: 'Search again', onPress: () => void scan() }}
            />
          )}

          {!connected && found.length > 0 && (
            <View style={styles.results}>
              <ThemedText type="defaultBold">Printers found</ThemedText>
              {found.map((printer) => (
                <Pressable
                  key={printer.id}
                  onPress={() => void connect(printer)}
                  disabled={connectingId !== null}
                  accessibilityRole="button"
                  accessibilityLabel={`Connect to ${printer.name}`}
                  accessibilityState={{ disabled: connectingId !== null, busy: connectingId === printer.id }}
                  style={({ pressed }) => [
                    styles.printerRow,
                    {
                      borderColor: theme.border,
                      backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
                    },
                  ]}>
                  <Icon name="printer" size={22} color={theme.textSecondary} />
                  <View style={styles.printerText}>
                    <ThemedText type="defaultBold">{printer.name}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                      {printer.id}
                    </ThemedText>
                  </View>
                  <ThemedText type="smallBold" style={{ color: theme.primary }}>
                    {connectingId === printer.id ? 'Connecting…' : 'Connect'}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1, alignItems: 'center', paddingHorizontal: Spacing.four },
  content: { width: '100%', maxWidth: MaxContentWidth, gap: Spacing.four },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Radius.card,
    borderWidth: 2,
  },
  statusText: { flex: 1, gap: Spacing.one },
  results: { gap: Spacing.two },
  printerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: MIN_TAP_TARGET,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.card,
    borderWidth: 2,
  },
  printerText: { flex: 1 },
});
