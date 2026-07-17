import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon, type IconName } from '@/shared/components/icon';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { Radius, Spacing, type TwdColors } from '@/shared/theme/twd';

/**
 * The one status vocabulary for the collector module.
 *
 * Two problems this exists to end:
 *
 * 1. Status colour was hardcoded inline on every screen using iOS system colours
 *    (#34C759, #007AFF, #FF3B30, #FF9500) that bypassed the theme entirely. All
 *    four failed WCAG AA against their own badge fill — #FF9500 "pending" measured
 *    1.77:1, effectively unreadable in the sun this app is used in. The TWD tokens
 *    they should have used were already sitting in shared/theme/twd.ts and all
 *    clear 4.5:1.
 *
 * 2. "PENDING" meant two unrelated things — a payment awaiting collection, and a
 *    record awaiting upload — in the same colour, on the same screen, with no
 *    explanation anywhere in the UI. A collector cannot act on an ambiguous badge.
 *    Sync status and payment status are therefore separate types here, and their
 *    labels are worded so they can never collide: sync says "Pending sync", never
 *    bare "Pending".
 *
 * Every badge pairs an icon with a word. Colour is never the only signal — that is
 * a WCAG requirement, and it is also just true that these get read one-handed, in
 * glare, by someone who is not looking carefully.
 */

export type SyncStatus = 'synced' | 'pending' | 'failed';
export type PaymentStatus = 'billed' | 'paid' | 'overdue' | 'pending';
export type ServiceOrderStatus = 'pending' | 'completed' | 'cancelled';
export type AccountStatus = 'active' | 'inactive';
/** Where an account stands on today's route. See READING below. */
export type ReadingState = 'unread' | 'pending' | 'done';

/** Matches the backend Announcement schema's two independent enums. */
export type NoticeType = 'interruption' | 'advisory' | 'service-update';
export type NoticePriority = 'high' | 'medium' | 'low';

/**
 * `neutral` is for states that are neither good nor bad — a dormant account, a
 * routine notice. It exists because the consumer screens were painting exactly
 * those states green (#34C759), which reads as "success" and is simply the wrong
 * claim: a low-priority announcement has not succeeded at anything.
 */
export type Tone = 'success' | 'info' | 'warning' | 'danger' | 'neutral';

interface Descriptor {
  label: string;
  tone: Tone;
  icon: IconName;
}

const SYNC: Record<SyncStatus, Descriptor> = {
  synced: { label: 'Synced', tone: 'success', icon: 'check' },
  // "Pending sync", never "Pending" — see above.
  pending: { label: 'Pending sync', tone: 'warning', icon: 'cloud-off' },
  /**
   * A send was attempted and did not land.
   *
   * Strictly narrower than `pending`, and only claimable in the session that
   * watched the attempt fail: nothing on disk records *why* a record is unsynced,
   * so after a restart an unsent record is `pending` again — we know it has not
   * arrived, not that anything went wrong. Painting it red on a fresh launch would
   * assert a failure nobody observed. Red is for the failure the collector just
   * watched happen, because that is the one they can act on.
   */
  failed: { label: 'Failed', tone: 'danger', icon: 'alert-triangle' },
};

const PAYMENT: Record<PaymentStatus, Descriptor> = {
  paid: { label: 'Paid', tone: 'success', icon: 'check' },
  billed: { label: 'Billed', tone: 'info', icon: 'file-text' },
  overdue: { label: 'Overdue', tone: 'danger', icon: 'alert-triangle' },
  pending: { label: 'Unpaid', tone: 'warning', icon: 'banknote' },
};

// Service orders (reconnections/disconnections). Bare "Pending" is safe here only
// because the sync vocabulary always says "Pending sync" — that wording rule is
// what keeps three kinds of pending from colliding on one screen.
const SERVICE_ORDER: Record<ServiceOrderStatus, Descriptor> = {
  pending: { label: 'Pending', tone: 'warning', icon: 'file-text' },
  completed: { label: 'Completed', tone: 'success', icon: 'check' },
  cancelled: { label: 'Cancelled', tone: 'danger', icon: 'x' },
};

/**
 * The route list's three states, which are three different jobs:
 *
 *   unread  → go here and read the meter
 *   pending → read, billed, receipt printed; TWD does not have it yet
 *   done    → read and confirmed received by TWD
 *
 * `unread` is neutral grey, not amber: an account the collector has not walked to
 * yet is not a warning, it is the entire remaining workload, and colouring twelve
 * of them amber at 7am makes the one that genuinely needs attention invisible.
 *
 * `pending` reuses the sync vocabulary verbatim — same "Pending sync" wording,
 * same cloud-off glyph, same amber — because it is the same fact as the SyncBadge
 * on every other screen. A collector should not have to learn that this list's
 * amber means what the last list's amber meant.
 */
const READING: Record<ReadingState, Descriptor> = {
  unread: { label: 'Unread', tone: 'neutral', icon: 'gauge' },
  pending: { label: 'Pending sync', tone: 'warning', icon: 'cloud-off' },
  done: { label: 'Done', tone: 'success', icon: 'check' },
};

const ACCOUNT: Record<AccountStatus, Descriptor> = {
  active: { label: 'Active', tone: 'success', icon: 'check' },
  // Not a failure and not an alarm — the connection is simply dormant. Grey.
  inactive: { label: 'Inactive', tone: 'neutral', icon: 'x' },
};

/**
 * What a notice *is* — its label and glyph. The consumer reads this to decide
 * whether it affects their water.
 */
const NOTICE_TYPE: Record<NoticeType, { label: string; icon: IconName }> = {
  interruption: { label: 'Service interruption', icon: 'alert-triangle' },
  advisory: { label: 'Advisory', icon: 'info' },
  'service-update': { label: 'Update', icon: 'megaphone' },
};

/** How much it matters. Drives tone only — never its own separate chip. */
const NOTICE_TONE: Record<NoticePriority, Tone> = {
  high: 'danger',
  medium: 'warning',
  low: 'neutral',
};

function toneColor(tone: Tone, theme: TwdColors): string {
  switch (tone) {
    case 'success':
      return theme.success;
    case 'info':
      return theme.primary;
    case 'warning':
      return theme.warning;
    case 'danger':
      return theme.danger;
    case 'neutral':
      return theme.textSecondary;
  }
}

interface BadgeProps {
  descriptor: Descriptor;
}

function Badge({ descriptor }: BadgeProps) {
  const theme = useTwdTheme();
  const color = toneColor(descriptor.tone, theme);

  return (
    <View
      style={[styles.badge, { borderColor: color }]}
      accessible
      // One announcement for the pair, rather than an unlabelled image followed by
      // a word.
      accessibilityRole="text"
      accessibilityLabel={descriptor.label}>
      <Icon name={descriptor.icon} size={14} color={color} />
      <ThemedText type="smallBold" style={[styles.label, { color }]}>
        {descriptor.label}
      </ThemedText>
    </View>
  );
}

export function SyncBadge({ status }: { status: SyncStatus }) {
  return <Badge descriptor={SYNC[status]} />;
}

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  return <Badge descriptor={PAYMENT[status]} />;
}

export function ServiceOrderBadge({ status }: { status: ServiceOrderStatus }) {
  return <Badge descriptor={SERVICE_ORDER[status]} />;
}

export function AccountStatusBadge({ status }: { status: AccountStatus }) {
  return <Badge descriptor={ACCOUNT[status]} />;
}

export function ReadingStateBadge({ state }: { state: ReadingState }) {
  return <Badge descriptor={READING[state]} />;
}

/**
 * One badge for a notice, from the two fields the backend actually stores.
 *
 * The consumer screen rendered these as two competing signals: an emoji for
 * `type` (⚠️/ℹ️/🔧) and a separate HIGH/MEDIUM/LOW pill for `priority`. That is
 * two encodings of one question — "does this affect me, and how much?" — and it
 * forced the reader to combine them. Worse, the priority pill was internal
 * jargon: a consumer does not rank their own water supply by priority tier.
 *
 * So: type supplies the words and the glyph ("Service interruption"), priority
 * supplies the tone. One chip, both axes, nothing to decode. The two stay
 * separate inputs rather than being collapsed into one severity field because the
 * backend schema keeps them independent — a brief off-peak interruption is
 * genuinely low priority, and a service update can genuinely be urgent.
 */
export function NoticeBadge({ type, priority }: { type: NoticeType; priority: NoticePriority }) {
  const { label, icon } = NOTICE_TYPE[type];
  return <Badge descriptor={{ label, icon, tone: NOTICE_TONE[priority] }} />;
}

/** The tone a notice's card should carry, so urgency is not left to the chip alone. */
export function noticeTone(priority: NoticePriority): Tone {
  return NOTICE_TONE[priority];
}

export function useToneColor(tone: Tone): string {
  const theme = useTwdTheme();
  return toneColor(tone, theme);
}

// There is deliberately no StatusLegend component. One existed briefly; it was a
// row of non-interactive badges that looked exactly like tappable chips, and the
// question "filter or legend?" should never need asking. Badges self-describe —
// each carries an icon and a word — so a separate key explains nothing, and
// anything that *behaves* like a filter should be a FilterChips row, which is
// visibly interactive.

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Radius.pill,
    // An outline rather than a tinted fill. A 12.5%-alpha fill of an accessible
    // colour is not itself accessible, and the border carries the tone at 3:1
    // without needing the text to fight its own background.
    borderWidth: 1.5,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: 12,
    lineHeight: 16,
  },
});
