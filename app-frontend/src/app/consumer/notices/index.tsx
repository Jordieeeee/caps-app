import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { listNotices, type Notice } from '@/consumer/services/consumer-data';
import { Icon, type IconName } from '@/shared/components/icon';
import { ListEmpty, ListError, ListLoading } from '@/shared/components/list-states';
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
  const { state, reload, refresh, refreshing, refreshFailed } = useAsync(
    useCallback(() => listNotices(), [])
  );

  return (
    <ScreenContainer onRefresh={() => void refresh()} refreshing={refreshing}>
      <ScreenHeader
        title="Notices"
        subtitle="Service updates from Tanauan City Water District"
        action={
          <RefreshButton onPress={() => void refresh()} busy={refreshing} subject="notices" />
        }
      />

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
          <ListLoading label="Loading notices…" />
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
        <ThemedText type="small" themeColor="textSecondary">
          Posted {notice.date}
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
