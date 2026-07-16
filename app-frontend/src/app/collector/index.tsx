import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { usePrinter } from '@/collector/services/printer-state';
import { loadToday, syncClaim, timeOfDay } from '@/collector/services/today';
import type { SyncStatus } from '@/collector/services/sync-service';
import { useSession } from '@/shared/auth/auth-context';
import { Icon, type IconName } from '@/shared/components/icon';
import { ListError } from '@/shared/components/list-states';
import { ScreenContainer, ScreenSection } from '@/shared/components/screen-container';
import { ScreenHeader } from '@/shared/components/screen-header';
import { SkeletonBlock } from '@/shared/components/skeleton';
import { TwdButton } from '@/shared/components/twd-button';
import { formatPeso } from '@/shared/format/currency';
import { useAsync } from '@/shared/hooks/use-async';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { MIN_TAP_TARGET, Radius, Spacing } from '@/shared/theme/twd';

/**
 * Home — the collector's status board for the shift.
 *
 * It answers, without a tap: what have I done today, is any of it still stuck on
 * this phone, and can I print? Those three facts previously lived on three
 * different tabs, which meant nobody checked them until something went wrong.
 *
 * "Record a reading" stays the one filled button on the screen. Everything above
 * it is status — glanceable, never competing — and the second CTA stays outlined.
 */
export default function CollectorHome() {
  const { session, sync } = useSession();
  const router = useRouter();
  const theme = useTwdTheme();
  const { state, reload } = useAsync(useCallback(() => loadToday(), []));

  const routes = session.user.routeIds ?? [];

  return (
    <ScreenContainer>
      <ScreenHeader title={firstName(session.user.name)} subtitle={greeting()} />

      <ScreenSection gap={Spacing.three}>
        <ThemedView type="backgroundElement" style={styles.routeCard}>
          <View style={styles.routeHeader}>
            {/* The same Lucide `gauge` the Readings tab and Sync rows use — a dial,
                because a meter reader recognises a dial. */}
            <Icon name="gauge" size={20} color={theme.primary} />
            <ThemedText type="defaultBold">Today&apos;s route</ThemedText>
          </View>
          <ThemedText style={styles.routeName} numberOfLines={2}>
            {routes.length ? routes.join(', ') : 'No route assigned'}
          </ThemedText>
          {!routes.length && (
            <ThemedText type="small" themeColor="textSecondary">
              Contact the TWD office to have a route assigned to your account.
            </ThemedText>
          )}
        </ThemedView>

        {/* Offline is a fact, not a failure. Stated once, above the numbers it
            explains, and never in place of them. */}
        {sync !== 'online' && (
          <StatusStrip
            icon="cloud-off"
            tone={theme.warning}
            text="Working offline. Everything you record is saved on this phone and sends itself when you get signal."
          />
        )}

        {state.status === 'loading' && <ProgressSkeleton />}

        {state.status === 'error' && (
          <ListError
            title="Could not read today's work"
            body="The records on this phone could not be counted. Your work is still saved — open Sync for detail."
            onRetry={reload}
          />
        )}

        {state.status === 'ready' && (
          <>
            <View style={styles.tiles}>
              <Tile
                icon="gauge"
                label="Readings today"
                value={`${state.data.readingsToday}`}
                onPress={() => router.push('/collector/reading-reports')}
              />
              <Tile
                icon="banknote"
                label="Collected today"
                value={formatPeso(state.data.collectedToday)}
                caption={
                  state.data.collectionsToday === 1
                    ? '1 payment'
                    : `${state.data.collectionsToday} payments`
                }
                onPress={() => router.push('/collector/daily-collections')}
              />
            </View>

            <SyncCard status={state.data.sync} />
          </>
        )}

        <PrinterCard />
      </ScreenSection>

      <ScreenSection gap={Spacing.three}>
        <TwdButton
          label="Record a reading"
          icon="gauge"
          onPress={() => router.push('/collector/reading-reports')}
          accessibilityHint="Opens meter readings for your route"
        />
        <TwdButton
          label="Record a collection"
          icon="banknote"
          variant="secondary"
          onPress={() => router.push('/collector/daily-collections')}
          accessibilityHint="Opens today's cash collections"
        />
      </ScreenSection>
    </ScreenContainer>
  );
}

/**
 * Sync, stated as something the app can actually know.
 *
 * Never a bare "Synced". The claim is always scoped in time — "All records sent ·
 * 14:32" — because an unqualified green tick reads as a live guarantee that TWD
 * holds the work right now, and a phone that spends its day in a barangay with no
 * signal cannot make that promise. See syncClaim() for the three cases.
 */
function SyncCard({ status }: { status: SyncStatus }) {
  const theme = useTwdTheme();
  const router = useRouter();
  const claim = syncClaim(status);

  const tone =
    claim.kind === 'pending' ? theme.warning : claim.kind === 'never' ? theme.textSecondary : theme.success;

  const headline =
    claim.kind === 'pending'
      ? claim.count === 1
        ? '1 record waiting'
        : `${claim.count} records waiting`
      : claim.kind === 'never'
        ? 'Nothing sent yet'
        : 'All records sent';

  const detail =
    claim.kind === 'pending'
      ? claim.lastSync === 0
        ? 'Saved on this phone. Nothing has reached TWD yet.'
        : `Saved on this phone. Last sent ${timeOfDay(claim.lastSync)}.`
      : claim.kind === 'never'
        ? 'Nothing has been sent to TWD from this phone.'
        : `Last sent ${timeOfDay(claim.lastSync)}.`;

  return (
    <Pressable
      onPress={() => router.push('/collector/more/sync-status')}
      accessibilityRole="button"
      accessibilityLabel={`${headline}. ${detail} Opens sync status.`}
      style={({ pressed }) => [
        styles.statusCard,
        {
          borderColor: tone,
          backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
        },
      ]}>
      <Icon
        name={claim.kind === 'pending' ? 'cloud-off' : claim.kind === 'never' ? 'refresh' : 'check'}
        size={22}
        color={tone}
      />
      <View style={styles.statusText}>
        <ThemedText type="defaultBold" style={{ color: tone }}>
          {headline}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {detail}
        </ThemedText>
      </View>
      <Icon name="chevron-right" size={20} color={theme.textSecondary} />
    </Pressable>
  );
}

/** Printer state, live. Subscribes, so a PT-210 dying in a bag is reflected here. */
function PrinterCard() {
  const theme = useTwdTheme();
  const router = useRouter();
  const printer = usePrinter();

  const tone = printer.status === 'connected' ? theme.success : theme.textSecondary;
  const headline =
    printer.status === 'connected'
      ? (printer.deviceName ?? 'Printer connected')
      : printer.status === 'connecting'
        ? 'Connecting…'
        : 'No printer connected';
  const detail =
    printer.status === 'connected'
      ? 'Ready to print receipts.'
      : printer.status === 'connecting'
        ? 'Pairing with the printer.'
        : 'Tap to connect the PT-210 before printing.';

  return (
    <Pressable
      onPress={() => router.push('/collector/more/printer')}
      accessibilityRole="button"
      accessibilityLabel={`${headline}. ${detail} Opens printer settings.`}
      style={({ pressed }) => [
        styles.statusCard,
        {
          borderColor: tone,
          backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
        },
      ]}>
      <Icon name={printer.status === 'connected' ? 'printer' : 'bluetooth'} size={22} color={tone} />
      <View style={styles.statusText}>
        <ThemedText type="defaultBold" style={{ color: tone }} numberOfLines={1}>
          {headline}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {detail}
        </ThemedText>
      </View>
      <Icon name="chevron-right" size={20} color={theme.textSecondary} />
    </Pressable>
  );
}

function Tile({
  icon,
  label,
  value,
  caption,
  onPress,
}: {
  icon: IconName;
  label: string;
  value: string;
  caption?: string;
  onPress: () => void;
}) {
  const theme = useTwdTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}${caption ? `, ${caption}` : ''}`}
      style={({ pressed }) => [
        styles.tile,
        { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement },
      ]}>
      <View style={styles.tileHeader}>
        <Icon name={icon} size={16} color={theme.textSecondary} />
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {label}
        </ThemedText>
      </View>
      <ThemedText style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
        {value}
      </ThemedText>
      {caption && (
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {caption}
        </ThemedText>
      )}
    </Pressable>
  );
}

function StatusStrip({ icon, tone, text }: { icon: IconName; tone: string; text: string }) {
  return (
    <View
      style={[styles.strip, { borderColor: tone }]}
      accessible
      accessibilityRole="summary">
      <Icon name={icon} size={20} color={tone} />
      <ThemedText type="small" style={[styles.stripText, { color: tone }]}>
        {text}
      </ThemedText>
    </View>
  );
}

/** Reserves the exact height the tiles and sync card will occupy, so nothing jumps. */
function ProgressSkeleton() {
  const theme = useTwdTheme();
  return (
    <View style={styles.skeleton} accessibilityRole="progressbar" accessibilityLabel="Loading today's work">
      <View style={styles.tiles}>
        {[0, 1].map((i) => (
          <View key={i} style={[styles.tile, { backgroundColor: theme.backgroundElement }]}>
            <SkeletonBlock height={14} width="70%" />
            <SkeletonBlock height={26} width="55%" />
          </View>
        ))}
      </View>
      <View style={[styles.statusCard, { borderColor: theme.border }]}>
        <SkeletonBlock height={22} width={22} />
        <View style={styles.statusText}>
          <SkeletonBlock height={16} width="45%" />
          <SkeletonBlock height={12} width="70%" />
        </View>
      </View>
    </View>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/** Route work is first-name work — the full legal name belongs on More. */
function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

const styles = StyleSheet.create({
  routeCard: { padding: Spacing.four, borderRadius: Radius.card, gap: Spacing.two },
  routeHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  // fontSize with its own lineHeight — overriding only fontSize leaves `title`'s
  // 52px line box on a smaller glyph, which is what wrapped the currency tiles.
  routeName: { fontSize: 24, lineHeight: 30, fontWeight: '700' },
  tiles: { flexDirection: 'row', gap: Spacing.three },
  tile: {
    flex: 1,
    minHeight: MIN_TAP_TARGET,
    borderRadius: Radius.card,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  tileHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  tileValue: { fontSize: 26, lineHeight: 32, fontWeight: '700' },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: MIN_TAP_TARGET,
    padding: Spacing.three,
    borderRadius: Radius.card,
    borderWidth: 2,
  },
  statusText: { flex: 1, gap: Spacing.half },
  strip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.card,
    borderWidth: 2,
  },
  stripText: { flex: 1 },
  skeleton: { gap: Spacing.three },
});
