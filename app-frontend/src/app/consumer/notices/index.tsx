import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  listNotices,
  listNotifications,
  markNotificationRead,
  type Notice,
  type Notification,
  type NotificationKind,
} from '@/consumer/services/consumer-data';
import { NoticeUnread, useUnreadNoticeCount } from '@/consumer/services/notice-unread';
import { useIdentity } from '@/shared/auth/auth-context';
import { formatPeso } from '@/shared/format/currency';
import { formatDate } from '@/shared/format/date';
import { Icon, type IconName } from '@/shared/components/icon';
import { CountBadge } from '@/shared/components/count-badge';
import { ListEmpty, ListError } from '@/shared/components/list-states';
import { SkeletonList } from '@/shared/components/skeleton';
import { RefreshButton, RefreshFailedNotice } from '@/shared/components/refresh-button';
import { ScreenContainer, ScreenSection } from '@/shared/components/screen-container';
import { ScreenHeader } from '@/shared/components/screen-header';
import { NoticeBadge, noticeTone, useToneColor } from '@/shared/components/status-badge';
import { useAsync } from '@/shared/hooks/use-async';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { MIN_TAP_TARGET, Radius, Spacing } from '@/shared/theme/twd';

/** Urgent first. A notice about a main going out tomorrow does not wait its turn. */
const ORDER: Record<Notice['priority'], number> = { high: 0, medium: 1, low: 2 };

/**
 * Notices — interruptions, advisories, and service updates from TWD.
 *
 * Renamed from Announcements, and the rename settles a real disagreement: the tab
 * said "Alert", the screen said "Announcements", and neither word appeared in the
 * other's UI. See consumer-tabs.tsx for why "Notices" won.
 */
export default function ConsumerNoticesScreen() {
  const router = useRouter();
  const { email } = useIdentity();
  const unread = useUnreadNoticeCount();
  const { state, reload, refresh, refreshing, refreshFailed } = useAsync(
    useCallback(() => listNotices(), [])
  );

  /**
   * The consumer's own messages, loaded separately from the district's notices.
   *
   * Two `useAsync` calls rather than one combined fetch, because the two lists fail
   * independently and only one of them is what this screen is for. A notices load
   * that succeeds must still render when `/notifications` is unreachable; merging
   * them into a single promise would make either failure blank the whole screen.
   */
  const inbox = useAsync(useCallback(() => listNotifications(), []));

  /**
   * ⚠️ Depends on `inbox.refresh`, NOT on `inbox`.
   *
   * `useAsync` returns a fresh object literal every render, so depending on the
   * whole thing gives `refreshAll` a new identity on every render — and this
   * callback is now the dependency of a `useFocusEffect` whose cleanup marks the
   * feed as seen. That would re-register the effect on every render and run the
   * cleanup with it, marking the notices seen dozens of times a second and
   * clearing the badge the instant it appeared. The two `refresh` functions are
   * stable (each is a `useCallback` over a stable loader), so naming them directly
   * makes this callback stable too.
   */
  const inboxRefresh = inbox.refresh;
  const refreshAll = useCallback(() => {
    void refresh();
    void inboxRefresh();
  }, [refresh, inboxRefresh]);

  /**
   * The list as it currently stands, for the mark-seen call below.
   *
   * A ref rather than a dependency, so the focus effect underneath registers once
   * per visit instead of re-registering — and re-running its cleanup — every time
   * the feed refreshes. That distinction is the whole behaviour of the badge: see
   * the comment on the effect.
   */
  const rendered = useRef<Notice[]>([]);
  useEffect(() => {
    if (state.status === 'ready') rendered.current = state.data;
  }, [state]);

  /**
   * Refresh on the way in; mark the feed seen on the way out.
   *
   * ⚠️ THIS SCREEN IS MOUNTED LONG BEFORE ANYONE LOOKS AT IT. NativeTabs renders
   * every tab's content when the shell mounts — there is no lazy gate (see
   * NativeBottomTabsNavigator: `contentRenderer: () => descriptors[key].render()`
   * runs for all four tabs) — so the load above happens at sign-in, and by the time
   * someone taps Notices its answer can be hours old. It is also why this needs no
   * "skip the first run" guard: the tab does not mount focused, so the first time
   * this fires is a genuine visit.
   *
   * Marking on the way OUT rather than on arrival is what makes the count on the
   * heading worth having. Marked on arrival — which is what this did — the badge
   * was cleared by the same render that drew it, so the number flashed up and
   * vanished before anyone could read it. Held until the consumer leaves, it
   * answers the question they came with: how many of these are new since last time.
   * A notice arriving mid-visit still increments it, live, which is the one moment
   * the whole feature is visible working.
   *
   * The backgrounding case is marked too. Otherwise a consumer who reads their
   * notices and then swipes the app away is shown the same badge on next launch,
   * for notices they have already read.
   */
  useFocusEffect(
    useCallback(() => {
      refreshAll();

      const markSeen = () => {
        if (email) void NoticeUnread.markSeen(email, rendered.current);
      };
      const background = AppState.addEventListener('change', (status) => {
        if (status !== 'active') markSeen();
      });

      return () => {
        background.remove();
        markSeen();
      };
    }, [refreshAll, email])
  );

  /**
   * Re-read the moment TWD publishes something, without waiting to be asked.
   *
   * This is the live half of the feature: the backend holds a connection open and
   * says "the feed changed" as the portal publishes (see notice-unread.ts, and
   * app-backend/services/noticeStream.js for the change stream behind it). The
   * event carries no notice — the list is re-fetched, so what renders has been
   * through the same audience gate as everything else on this screen.
   *
   * `refresh`, never `reload`: a consumer reading an interruption notice must not
   * have it replaced by a skeleton because a second, unrelated notice arrived.
   */
  useEffect(() => NoticeUnread.onFeedChanged(refreshAll), [refreshAll]);


  return (
    <ScreenContainer onRefresh={refreshAll} refreshing={refreshing || inbox.refreshing}>
      <ScreenHeader
        title="Notices"
        subtitle="Service updates from Tanauan City Water District"
        /* Beside the title, and it disappears as you read: the mark-seen effect
           above fires as soon as the list is on screen, so the number is here to
           tell someone arriving from another tab what they arrived for. */
        badge={<CountBadge count={unread} label="new notices" />}
        action={<RefreshButton onPress={refreshAll} busy={refreshing} subject="notices" />}
      />

      {/* Addressed to this consumer, so it sits above everything the district
          published to everyone.

          RENDERED ONLY WHEN THERE IS SOMETHING IN IT, and there will not be for a
          while: `consumernotifications` has no writer yet (see
          app-backend/models/Notification.js). A permanent "No messages" panel at the
          top of the screen would cost every consumer a scroll, every visit, to be
          told nothing — and an empty state is worth showing only where its absence
          would leave someone wondering whether the screen had loaded. Nobody comes
          to Notices looking for an inbox they have never seen.

          A failed load renders nothing for the same reason, and deliberately gets no
          error banner: there is no action behind it, and a red row about messages
          that do not exist would be alarming and untrue. The notices list below
          keeps its own `RefreshFailedNotice`, because that one is about content the
          consumer came here for. */}
      {inbox.state.status === 'ready' && inbox.state.data.length > 0 && (
        <ScreenSection gap={Spacing.three}>
          {inbox.state.data.map((notification) => (
            <NotificationCard
              key={notification.id}
              notification={notification}
              onRead={inbox.refresh}
            />
          ))}
        </ScreenSection>
      )}

      {/* See bills/index.tsx — only meaningful next to rows we are still showing. */}
      {state.status === 'ready' && refreshFailed && <RefreshFailedNotice subject="notices" />}

      {/* Above the notices rather than under them, and outside every loading and
          error branch, so it is reachable in all three states and on the day the
          list is empty. A consumer who wants to report a burst pipe should not have
          to scroll past the district's announcements to find the way to say so —
          and these two rows have just moved off the Account tab, so for a while
          people will be looking for them. */}
      <ScreenSection gap={Spacing.two}>
        <FeedbackRow
          icon="message-square"
          label="Send feedback"
          detail="Report an issue"
          onPress={() => router.push('/consumer/notices/feedback')}
        />

        {/* Sits directly under Send feedback, in that order, because the pair reads
            as one thing a consumer does and then checks on. Kept as its own row
            rather than a tab inside the form: the form is a task with a keyboard and
            an unsaved draft, and putting a navigation control inside it invites
            someone to lose a half-typed message by tapping across. */}
        <FeedbackRow
          icon="inbox"
          label="Your feedback"
          detail="See what you've sent and its status"
          onPress={() => router.push('/consumer/notices/feedback-history')}
        />
      </ScreenSection>

      {state.status === 'loading' && (
        <ScreenSection>
          <SkeletonList count={3} label="Loading notices" />
        </ScreenSection>
      )}

      {state.status === 'error' && (
        <ScreenSection>
          <ListError
            title="Could not load notices"
            body="We couldn't reach Tanauan City Water District just now. Check your connection and try again."
            onRetry={reload}
          />
        </ScreenSection>
      )}

      {state.status === 'ready' && state.data.length === 0 && (
        <ScreenSection>
          <ListEmpty
            icon="megaphone"
            title="No notices right now"
            body="Service interruptions and advisories for your area will appear here. We'll keep this up to date."
          />
        </ScreenSection>
      )}

      {state.status === 'ready' && state.data.length > 0 && (
        <ScreenSection gap={Spacing.three}>
          {[...state.data]
            .sort((a, b) => ORDER[a.priority] - ORDER[b.priority] || b.date.localeCompare(a.date))
            .map((notice) => (
              <NoticeCard key={notice.id} notice={notice} />
            ))}
        </ScreenSection>
      )}
    </ScreenContainer>
  );
}

/**
 * Icon per kind. Silhouettes, not colours — same reasoning as NoticeCard below.
 *
 * `announcement` reuses the megaphone the notices carry, because a district
 * announcement sent to one household is the same kind of thing as one posted to
 * everybody; only the delivery differs.
 */
const KIND_ICON: Record<NotificationKind, IconName> = {
  'due-reminder': 'calendar',
  'payment-confirmation': 'file-check',
  'service-alert': 'alert-triangle',
  announcement: 'megaphone',
};

/**
 * One message addressed to this consumer.
 *
 * Tapping marks it read, and the row is a button only while it is unread — a read
 * notification has nothing left to do, and leaving it pressable invites a tap that
 * appears to do nothing. The card does not navigate anywhere: there is no detail
 * view behind a message that is already one sentence long.
 *
 * The optimistic update is deliberately absent. Marking read locally and reverting
 * on failure would flicker an unread dot back into view seconds later; here the row
 * simply stays unread until TWD has actually recorded that it was read, which is
 * the same rule the collector's sync obeys about not claiming a record has landed.
 *
 * `amount` and `dueDate` render only when the server sent them. A `due-reminder`
 * missing its figure shows no figure — never ₱0.00, which is a claim that the
 * household owes nothing (see the `Account.outstanding` comment in consumer/types.ts).
 */
function NotificationCard({
  notification,
  onRead,
}: {
  notification: Notification;
  onRead: () => void;
}) {
  const theme = useTwdTheme();
  const [busy, setBusy] = useState(false);
  const unread = !notification.read;

  const markRead = () => {
    if (!unread || busy) return;
    setBusy(true);
    void markNotificationRead(notification.id)
      .then(onRead)
      .catch(() => {
        // Stays unread, which is the truth: TWD did not record the read. No alert —
        // the consumer did not ask for anything, so there is nothing to report.
      })
      .finally(() => setBusy(false));
  };

  return (
    <Pressable
      onPress={markRead}
      disabled={!unread || busy}
      accessibilityRole={unread ? 'button' : undefined}
      accessibilityLabel={
        unread ? `Unread: ${notification.message}. Tap to mark as read.` : notification.message
      }
      style={({ pressed }) => [
        styles.card,
        {
          borderColor: unread ? theme.primary : theme.border,
          borderWidth: unread ? 3 : 2,
          backgroundColor:
            pressed && unread ? theme.backgroundSelected : theme.backgroundElement,
        },
      ]}>
      <View style={styles.notificationHeader}>
        <Icon
          name={KIND_ICON[notification.kind]}
          size={20}
          color={unread ? theme.primary : theme.textSecondary}
        />
        {unread && (
          <View
            style={[styles.unreadDot, { backgroundColor: theme.primary }]}
            accessibilityElementsHidden
          />
        )}
        <ThemedText type="small" themeColor="textSecondary" style={styles.notificationDate}>
          {formatDate(notification.createdAt)}
        </ThemedText>
      </View>

      <ThemedText type={unread ? 'defaultBold' : 'default'} style={styles.content}>
        {notification.message}
      </ThemedText>

      {(notification.amount !== null || notification.dueDate !== null) && (
        <View style={[styles.footer, { borderTopColor: theme.border }]}>
          {notification.amount !== null && (
            <ThemedText type="defaultBold">{formatPeso(notification.amount)}</ThemedText>
          )}
          {notification.dueDate !== null && (
            <ThemedText type="small" themeColor="textSecondary">
              Due {formatDate(notification.dueDate)}
            </ThemedText>
          )}
        </View>
      )}

      {notification.accountNumber !== null && (
        <ThemedText type="small" themeColor="textSecondary">
          {notification.accountNumber}
        </ThemedText>
      )}
    </Pressable>
  );
}

/**
 * One way into the feedback conversation.
 *
 * Deliberately not styled as a notice card: these are controls, and a row that
 * borrowed the card's shape would read as another thing the district had announced.
 * Border, height and chevron match the nav rows this pair had on the Account tab, so
 * the move changes where they are and not what they look like.
 *
 * The label and its detail are stacked, not laid side by side on one line. Side by
 * side is what this row shipped as, and it broke on the second of the two: a `Text`
 * defaults to `flexShrink: 0` in Yoga, so "See what you've sent and its status"
 * — about 245pt at 14pt type — never gave any width back, while the label beside it
 * carried `flex: 1` and absorbed the whole overflow. There are only ~222pt to share
 * once the icon, the chevron and three 16pt gaps are paid for, so "Your feedback"
 * was squeezed to nothing and wrapped, while "Send feedback" sat on one line beside
 * its much shorter "Report an issue" — two rows of the same component, visibly
 * misaligned. Stacking gives the detail the full width of the row and makes the
 * layout independent of how long either string is, which is the property a
 * translated or reworded label needs anyway.
 */
function FeedbackRow({
  icon,
  label,
  detail,
  onPress,
}: {
  icon: IconName;
  label: string;
  detail: string;
  onPress: () => void;
}) {
  const theme = useTwdTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${detail}`}
      style={({ pressed }) => [
        styles.feedbackRow,
        {
          borderColor: theme.border,
          backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
        },
      ]}>
      <Icon name={icon} size={22} color={theme.textSecondary} />
      <View style={styles.feedbackText}>
        <ThemedText type="defaultBold">{label}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {detail}
        </ThemedText>
      </View>
      <Icon name="chevron-right" size={18} color={theme.textSecondary} />
    </Pressable>
  );
}

/**
 * One notice.
 *
 * Urgency is carried four ways, none of which is colour on its own — the skill's
 * severity search returned zero results, so this is argued rather than cited, and
 * the argument is that this app gets read outdoors, at arm's length, by people
 * across a wide range of eyesight and reading confidence:
 *
 *   1. the badge's words — "Service interruption", not "HIGH"
 *   2. the badge's glyph — triangle vs circle vs megaphone, distinct in silhouette
 *   3. the card's border weight — 3px on high priority, 2px otherwise
 *   4. position — high priority sorts to the top
 *
 * What it replaced: an emoji for type (⚠️/ℹ️/🔧) plus a separate HIGH/MEDIUM/LOW
 * pill — two chips for one question, one of them internal jargon, and LOW painted
 * green (#34C759), the success colour, on an item that has not succeeded at
 * anything. Routine news is grey now.
 */
function NoticeCard({ notice }: { notice: Notice }) {
  const theme = useTwdTheme();
  const accent = useToneColor(noticeTone(notice.priority));
  const urgent = notice.priority === 'high';

  return (
    <ThemedView
      type="backgroundElement"
      style={[styles.card, { borderColor: accent, borderWidth: urgent ? 3 : 2 }]}
      accessible
      accessibilityRole="summary">
      <View style={styles.headerText}>
        <NoticeBadge type={notice.type} priority={notice.priority} />
        <ThemedText type="defaultBold" style={styles.cardTitle}>
          {notice.title}
        </ThemedText>
      </View>

      <ThemedText type="small" style={styles.content}>
        {notice.content}
      </ThemedText>

      <View style={[styles.footer, { borderTopColor: theme.border }]}>
        <Icon name="calendar" size={14} color={theme.textSecondary} />
        {/* Through formatDate like every other date in the app. This printed
            `notice.date` raw, so a card read "Posted 2026-08-08T08:14:34.681Z" —
            the machine timestamp the module note at the top of shared/format/date.ts
            exists to keep off a consumer's screen. */}
        <ThemedText type="small" themeColor="textSecondary">
          Posted {formatDate(notice.date)}
        </ThemedText>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  feedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: MIN_TAP_TARGET,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.card,
    borderWidth: 2,
  },
  // `flex: 1` on the block, not on the label inside it: the block is what has to
  // claim the space left between the icon and the chevron, and both lines then
  // wrap inside it instead of competing with each other for the same row.
  feedbackText: { flex: 1, gap: Spacing.half },
  card: {
    borderRadius: Radius.card,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  headerText: { gap: Spacing.two, alignItems: 'flex-start' },
  notificationHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  // Pushes the date to the trailing edge without a spacer view.
  notificationDate: { marginLeft: 'auto' },
  unreadDot: { width: 8, height: 8, borderRadius: 4 },
  cardTitle: { fontSize: 17, lineHeight: 24 },
  content: { lineHeight: 21 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingTop: Spacing.two,
    borderTopWidth: 1,
  },
});
