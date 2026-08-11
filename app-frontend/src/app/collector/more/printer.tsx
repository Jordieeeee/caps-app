import { useCallback, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import {
  PrinterService,
  isBluetoothPermissionError,
  type BlePermissionResult,
} from '@/collector/services/printer-service';
import { Icon } from '@/shared/components/icon';
import { ListEmpty, ListLoading } from '@/shared/components/list-states';
import { ScreenContainer, ScreenSection } from '@/shared/components/screen-container';
import { TwdButton } from '@/shared/components/twd-button';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { MIN_TAP_TARGET, Radius, Spacing } from '@/shared/theme/twd';

interface FoundPrinter {
  id: string;
  name: string;
}

/**
 * What to say when Android refuses the radio.
 *
 * The two cases need different instructions and only one of them can be fixed from
 * inside the app. `denied` means the collector tapped Deny once — the dialog comes
 * back, so "try again" is real advice. `blocked` is Android's "don't ask again":
 * no prompt will ever appear again, so a Try again button would be a button that
 * does nothing, and the only way through is the app's settings page.
 *
 * Both say what is *not* wrong, because the collector standing at a meter has no
 * way to tell a permission problem from a broken printer, and the reflex is to go
 * looking for the hardware fault.
 */
function alertPermission(result: Extract<BlePermissionResult, 'denied' | 'blocked'>) {
  if (result === 'blocked') {
    Alert.alert(
      'Bluetooth access is turned off',
      'This app is not allowed to use Bluetooth, so it cannot find the printer. Open app settings, allow "Nearby devices", then come back and search again.\n\nThere is nothing wrong with the printer.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open settings', onPress: () => void Linking.openSettings() },
      ]
    );
    return;
  }

  Alert.alert(
    'Bluetooth access is needed',
    'TWD needs permission to use Bluetooth to find the PT-210 printer. It is only used to connect to the printer — it is never used for your location.\n\nTap Search again and choose Allow.',
    [{ text: 'OK' }]
  );
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
    } catch (error) {
      // A refused permission is not a failed search, and telling a collector to
      // "check that Bluetooth is turned on" when Bluetooth is on and the app was
      // simply never allowed to use it sends them to the wrong setting entirely.
      if (isBluetoothPermissionError(error)) {
        alertPermission(error.result);
      } else {
        Alert.alert(
          'Could not search',
          'Bluetooth search failed. Check that Bluetooth is turned on, then try again.',
          [{ text: 'OK' }]
        );
      }
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
    } catch (error) {
      // Same split as the scan: connecting needs its own grant (BLUETOOTH_CONNECT),
      // so this is reachable even after a scan that the collector did allow.
      if (isBluetoothPermissionError(error)) {
        alertPermission(error.result);
      } else {
        Alert.alert(
          'Could not connect',
          `${printer.name} did not accept the connection. Make sure it is switched on and close to the phone, then try again.`,
          [{ text: 'OK' }]
        );
      }
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

  /**
   * On the shared shell, like every other screen.
   *
   * This previously hand-rolled its own `ScrollView` and applied
   * `useStackContentInsets()` on top of a local `paddingHorizontal: Spacing.four`:
   *
   *     contentContainerStyle={[styles.scroll, insets]}
   *     // styles.scroll → paddingHorizontal: 24
   *     // insets        → paddingLeft: safeArea.left, paddingRight: safeArea.right
   *
   * Yoga resolves the edge-specific `paddingLeft`/`paddingRight` ahead of the
   * `paddingHorizontal` shorthand no matter which order the array puts them in, and
   * both of those are 0 in portrait — so the intended 24pt gutter was silently
   * dropped and the status card and Search button sat flush against the display
   * edges while every other screen inset by 24. ScreenSection owns the gutter now,
   * and there is no second source to lose to.
   */
  return (
    <ScreenContainer variant="stack">
      <ScreenSection gap={Spacing.four}>
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
      </ScreenSection>
    </ScreenContainer>
  );
}

// Layout styles are gone: `root`, `scroll` and `content` reimplemented what
// ScreenContainer/ScreenSection already provide (flex, centring, max width,
// gutter, insets). Only the screen's own component styling remains.
const styles = StyleSheet.create({
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
