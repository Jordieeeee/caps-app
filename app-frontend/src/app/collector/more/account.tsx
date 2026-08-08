import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  CollectorProfileService,
  type CollectorProfile,
} from '@/collector/services/collector-profile';
import { timeOfDay } from '@/collector/services/today';
import { useSession } from '@/shared/auth/auth-context';
import { Icon } from '@/shared/components/icon';
import { ListError } from '@/shared/components/list-states';
import { ScreenContainer, ScreenSection } from '@/shared/components/screen-container';
import { SkeletonBlock, SkeletonList } from '@/shared/components/skeleton';
import { TwdButton } from '@/shared/components/twd-button';
import { formatDate } from '@/shared/format/date';
import { useAsync } from '@/shared/hooks/use-async';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { Radius, Spacing } from '@/shared/theme/twd';

/**
 * Account — the collector's own employment record, in full.
 *
 * The More hub used to be the whole of it: a name in a header and a route id in a
 * subtitle, both read from a session token that can legally be ninety days old.
 * Everything else TWD holds about the person carrying the phone — employee ID,
 * zone, assigned routes, contact number, hire date, whether the account is still
 * active — existed on the Collector document and had never been fetched.
 *
 * It is worth a screen for three reasons that are not "completeness":
 *
 *   • A collector at a gate is asked who they are. The employee ID and the zone
 *     are the answer, and they should not have to be remembered.
 *   • A wrong route assignment is why a collector walks a barangay that is not
 *     theirs. The only way to notice it is to be able to see it.
 *   • `status: disabled` is the difference between "the app is broken" and "your
 *     account was deactivated this morning" — a call to the office either way, but
 *     a much shorter one.
 *
 * Read-only, deliberately. Everything here is an employment fact set by TWD, and
 * the schema-level argument for that is the same one made for the consumer's
 * identity fields: see the long note in app-backend/models/Consumer.js.
 */
export default function CollectorAccountScreen() {
  const { session } = useSession();
  const router = useRouter();
  const { state, reload, refresh, refreshing } = useAsync(
    useCallback(() => CollectorProfileService.load(), [])
  );

  /**
   * Editing happens on a pushed screen, so the saved value has to be picked up on
   * the way back. `refresh`, not `reload`: reload blanks the whole record to a
   * skeleton, and returning from a one-field edit should not look like a reload of
   * everything.
   */
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const snapshot = state.status === 'ready' ? state.data : null;

  return (
    <ScreenContainer variant="stack" onRefresh={refresh} refreshing={refreshing}>
      {state.status === 'loading' && (
        <ScreenSection gap={Spacing.three}>
          <SkeletonBlock height={96} />
          <SkeletonList count={2} label="Loading your details" />
        </ScreenSection>
      )}

      {/* Reached only when the network failed AND this phone has never cached the
          record — the service falls back to the saved copy before it throws. */}
      {state.status === 'error' && (
        <ScreenSection>
          <ListError
            title="Could not load your details"
            body="TWD could not be reached and this phone has no saved copy of your record yet. Your work is unaffected — readings and collections are stored on the device either way."
            onRetry={reload}
          />
        </ScreenSection>
      )}

      {snapshot && (
        <>
          <IdentityCard profile={snapshot.profile} />

          <ScreenSection gap={Spacing.three}>
            <SectionTitle icon="user" title="Personal details" />
            <ThemedView type="backgroundElement" style={styles.card}>
              <DetailRow label="Full name" value={snapshot.profile.name} />
              <DetailRow label="Employee ID" value={snapshot.profile.employeeId} />
              <DetailRow label="Email" value={snapshot.profile.email ?? session.user.email} />
              <DetailRow label="Mobile number" value={snapshot.profile.phone} />
              <DetailRow
                label="Account status"
                value={snapshot.profile.status === 'active' ? 'Active' : 'Deactivated'}
                tone={snapshot.profile.status === 'active' ? undefined : 'danger'}
                last
              />
            </ThemedView>

            {/* The only editable field on this screen lives one push away rather
                than inline: a form inside a read-only record makes every other row
                look like it failed to become an input. */}
            <TwdButton
              label="Edit my details"
              icon="pencil"
              variant="secondary"
              onPress={() => router.push('/collector/more/edit-details')}
              accessibilityHint="Change the mobile number TWD reaches you on"
            />
          </ScreenSection>

          <ScreenSection gap={Spacing.three}>
            <SectionTitle icon="map" title="Assignment" />
            <ThemedView type="backgroundElement" style={styles.card}>
              <DetailRow label="Zone" value={snapshot.profile.zone} />
              {/* Plural because a collector can hold more than one, and the count
                  is stated because "R-01, R-04" at a glance is easy to read as one
                  route with a comma in it. */}
              <DetailRow
                label={snapshot.profile.routeIds.length === 1 ? 'Assigned route' : 'Assigned routes'}
                value={snapshot.profile.routeIds.join(', ')}
              />
              <DetailRow
                label="Routes held"
                value={`${snapshot.profile.routeIds.length}`}
                last
              />
            </ThemedView>
          </ScreenSection>

          <ScreenSection gap={Spacing.three}>
            <SectionTitle icon="file-check" title="Service record" />
            <ThemedView type="backgroundElement" style={styles.card}>
              <DetailRow label="Date hired" value={formatDate(snapshot.profile.dateHired ?? undefined)} />
              <DetailRow
                label="Record created"
                value={formatDate(snapshot.profile.memberSince ?? undefined)}
              />
              {/* Counted by the server, from what TWD actually holds — never from
                  this phone's outbox. The gap between the two is the entire subject
                  of the Sync screen, and a total that quietly included unsent work
                  would be the app vouching for records the district has never seen.

                  "Payments received by TWD" used to sit under this and was always
                  0: collectors read meters, they do not take money. */}
              <DetailRow
                label="Readings received by TWD"
                value={`${snapshot.profile.service.readingsSubmitted}`}
                last
              />
            </ThemedView>

            <FreshnessNote fromCache={snapshot.fromCache} fetchedAt={snapshot.fetchedAt} />
          </ScreenSection>

          <OfficeNote />
        </>
      )}
    </ScreenContainer>
  );
}

/** Where these values come from, and what to do about a wrong one. */
function OfficeNote() {
  const theme = useTwdTheme();

  return (
    <ScreenSection>
      <View
        style={[styles.note, { borderColor: theme.border }]}
        accessible
        accessibilityRole="summary">
        <Icon name="info" size={20} color={theme.textSecondary} />
        <ThemedText type="small" themeColor="textSecondary" style={styles.noteText}>
          You can change your mobile number here. Your name, employee ID, zone, assigned routes
          and hire date are employment records held by the Tanauan City Water District and are
          changed at the office — if any of those is wrong, especially your routes, tell the
          office before you start your next round.
        </ThemedText>
      </View>
    </ScreenSection>
  );
}

/**
 * Name, employee ID, zone — the three things someone says out loud at a gate.
 *
 * Given its own card at the top because it is the answer to "who are you?", and a
 * collector asked that question is holding a phone in one hand and a meter key in
 * the other. It should not require reading a table.
 */
function IdentityCard({ profile }: { profile: CollectorProfile }) {
  const theme = useTwdTheme();

  return (
    <ScreenSection gap={Spacing.three}>
      <ThemedView type="backgroundElement" style={[styles.card, styles.identity]}>
        <View style={[styles.avatar, { borderColor: theme.primary }]}>
          <Icon name="user" size={28} color={theme.primary} />
        </View>
        <View style={styles.identityText}>
          <ThemedText type="defaultBold" style={styles.identityName} numberOfLines={2}>
            {profile.name ?? 'Name not on file'}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Collector{profile.employeeId ? ` · ${profile.employeeId}` : ''}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {profile.zone ?? 'No zone assigned'}
          </ThemedText>
        </View>
      </ThemedView>
    </ScreenSection>
  );
}

function SectionTitle({ icon, title }: { icon: 'user' | 'map' | 'file-check'; title: string }) {
  const theme = useTwdTheme();

  return (
    <View style={styles.sectionTitle}>
      <Icon name={icon} size={18} color={theme.textSecondary} />
      <ThemedText type="defaultBold">{title}</ThemedText>
    </View>
  );
}

/**
 * When this was read, and from where.
 *
 * Past tense with a timestamp, never a bare "up to date" — same rule the sync
 * screen follows. The app knows when it last successfully asked TWD; it cannot
 * know that the office has not changed the record since.
 */
function FreshnessNote({ fromCache, fetchedAt }: { fromCache: boolean; fetchedAt: number | null }) {
  const theme = useTwdTheme();
  if (fetchedAt === null) return null;

  return (
    <View style={styles.freshness}>
      <Icon
        name={fromCache ? 'cloud-off' : 'refresh'}
        size={14}
        color={fromCache ? theme.warning : theme.textSecondary}
      />
      <ThemedText type="small" style={{ color: fromCache ? theme.warning : theme.textSecondary }}>
        {fromCache
          ? `Could not reach TWD. Showing the copy saved ${timeOfDay(fetchedAt)}.`
          : `Read from TWD ${timeOfDay(fetchedAt)}.`}
      </ThemedText>
    </View>
  );
}

/**
 * Rows the district has nothing for say "Not on file" rather than disappearing.
 *
 * A missing row is indistinguishable from a row that scrolled past; an explicit
 * blank is a prompt to go and get it filled in. Same argument as the consumer's
 * details card, and the same words, so the two read as one product.
 */
function DetailRow({
  label,
  value,
  tone,
  last,
}: {
  label: string;
  value: string | null | undefined;
  tone?: 'danger';
  last?: boolean;
}) {
  const theme = useTwdTheme();
  const known = !!value;

  return (
    <View
      style={[
        styles.detailRow,
        last ? null : { borderBottomColor: theme.border, borderBottomWidth: 1 },
      ]}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.detailLabel}>
        {label}
      </ThemedText>
      <ThemedText
        type={known ? 'defaultBold' : 'small'}
        style={[
          styles.detailValue,
          !known ? { color: theme.textSecondary } : tone === 'danger' ? { color: theme.danger } : null,
        ]}>
        {known ? value : 'Not on file'}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.card,
    padding: Spacing.four,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: Radius.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityText: { flex: 1, gap: Spacing.half },
  identityName: { fontSize: 18 },
  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  freshness: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  /**
   * Label and value share a row and both may wrap. `flex: 1` on the value is what
   * keeps a long email inside the card: without it the value reports its full
   * unwrapped width as the row's intrinsic width, which propagates up and pushes
   * the card past the viewport.
   */
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
  },
  detailLabel: { flexShrink: 0 },
  detailValue: { flex: 1, textAlign: 'right' },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.card,
    borderWidth: 1,
  },
  noteText: { flex: 1 },
});
