import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { feedbackOption } from '@/consumer/feedback-options';
import { listMyFeedback, type Feedback } from '@/consumer/services/consumer-data';
import { Icon } from '@/shared/components/icon';
import { ListEmpty, ListError, ListLoading } from '@/shared/components/list-states';
import { ScreenContainer, ScreenSection } from '@/shared/components/screen-container';
import { FeedbackBadge } from '@/shared/components/status-badge';
import { formatDate } from '@/shared/format/date';
import { useAsync } from '@/shared/hooks/use-async';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { Radius, Spacing } from '@/shared/theme/twd';

/**
 * Your feedback — everything this consumer has sent TWD, and where each one stands.
 *
 * The send form already tells someone their message left the device. What it could
 * not tell them is anything afterwards: once the success card was dismissed the
 * message was gone from the app entirely, so "did TWD ever look at this?" had no
 * answer short of phoning the office. That is the gap this screen closes, and it is
 * the reason the list shows the full message body rather than a preview — the
 * consumer's own words are the only record they have of what they reported.
 *
 * Deliberately read-only. There is no reply thread, no edit, and no withdraw,
 * because the backend has none of those things; offering any of them would be a
 * button that fails, which is the failure mode this module keeps having to undo.
 */
export default function ConsumerFeedbackHistoryScreen() {
  const router = useRouter();
  const { state, reload } = useAsync(useCallback(() => listMyFeedback(), []));

  // Refetch on focus so a message sent on the form screen is present when the
  // consumer comes back here, rather than only after a manual pull.
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  return (
    <ScreenContainer variant="stack" onRefresh={reload} refreshing={false}>
      {state.status === 'loading' && (
        <ScreenSection>
          <ListLoading label="Loading your feedback…" />
        </ScreenSection>
      )}

      {state.status === 'error' && (
        <ScreenSection>
          <ListError
            title="Could not load your feedback"
            body="We couldn't reach Tanauan City Water District just now. Check your connection and try again."
            onRetry={reload}
          />
        </ScreenSection>
      )}

      {state.status === 'ready' && state.data.length === 0 && (
        <ScreenSection>
          <ListEmpty
            icon="message-square"
            title="You haven't sent any feedback"
            body="Anything you send TWD will appear here, along with whether they've reviewed it."
            action={{
              label: 'Send feedback',
              // replace, not push: arriving at the form from an empty history and
              // then backing out should land on Account, not on the empty list the
              // message no longer belongs in.
              onPress: () => router.replace('/consumer/notices/feedback'),
            }}
          />
        </ScreenSection>
      )}

      {state.status === 'ready' && state.data.length > 0 && (
        <ScreenSection gap={Spacing.three}>
          {state.data.map((item) => (
            <FeedbackCard key={item.id} item={item} />
          ))}

          <ThemedText type="small" themeColor="textSecondary" style={styles.footnote}>
            TWD updates the status as they work through what they receive. This screen is
            not a reply channel — for anything urgent, call the district office.
          </ThemedText>
        </ScreenSection>
      )}
    </ScreenContainer>
  );
}

/**
 * One submitted message.
 *
 * The category is shown as a quiet line above the subject rather than as a second
 * badge: the status badge is the only thing on this card whose value changes, and
 * pairing it with a same-shaped category chip would make the card look like it
 * carried two statuses — the exact two-chips-for-one-question problem NoticeBadge
 * was built to remove.
 */
function FeedbackCard({ item }: { item: Feedback }) {
  const theme = useTwdTheme();
  const option = feedbackOption(item.type);

  return (
    <ThemedView
      type="backgroundElement"
      style={[styles.card, { borderColor: theme.border }]}
      accessible
      accessibilityRole="summary">
      <View style={styles.header}>
        <FeedbackBadge status={item.status} />
      </View>

      <View style={styles.titleBlock}>
        <View style={styles.categoryRow}>
          <Icon name={option?.icon ?? 'message-square'} size={14} color={theme.textSecondary} />
          <ThemedText type="small" themeColor="textSecondary">
            {/* Falls back to the stored value so a category added to the backend
                after this build ships still names itself, rather than blanking. */}
            {option?.title ?? item.type}
          </ThemedText>
        </View>
        <ThemedText type="defaultBold" style={styles.subject}>
          {item.subject}
        </ThemedText>
      </View>

      <ThemedText type="small" style={styles.message}>
        {item.message}
      </ThemedText>

      <View style={[styles.footer, { borderTopColor: theme.border }]}>
        <Icon name="calendar" size={14} color={theme.textSecondary} />
        <ThemedText type="small" themeColor="textSecondary">
          Sent {formatDate(item.submittedAt)}
          {/* Only rendered once staff have actually moved the record — the server
              sends null while it is untouched, so this never claims a review that
              has not happened. */}
          {item.statusChangedAt ? ` · Updated ${formatDate(item.statusChangedAt)}` : ''}
        </ThemedText>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.card,
    borderWidth: 2,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  header: { flexDirection: 'row', alignItems: 'center' },
  titleBlock: { gap: Spacing.one },
  categoryRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  subject: { fontSize: 17, lineHeight: 24 },
  message: { lineHeight: 21 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingTop: Spacing.two,
    borderTopWidth: 1,
  },
  footnote: { lineHeight: 20, textAlign: 'center' },
});
