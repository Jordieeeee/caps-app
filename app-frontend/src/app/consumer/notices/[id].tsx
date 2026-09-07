import { useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { listNotices } from '@/consumer/services/consumer-data';
import { Icon } from '@/shared/components/icon';
import { ListEmpty, ListError } from '@/shared/components/list-states';
import { ScreenContainer, ScreenSection } from '@/shared/components/screen-container';
import { SkeletonList } from '@/shared/components/skeleton';
import { NoticeBadge, noticeTone, useToneColor } from '@/shared/components/status-badge';
import { formatDate } from '@/shared/format/date';
import { useAsync } from '@/shared/hooks/use-async';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { Radius, Spacing } from '@/shared/theme/twd';

/**
 * One notice, in full.
 *
 * The card on the list is a summary — it clamps the body to three lines, because a
 * district that posts a long advisory would otherwise push every notice under it
 * off the screen. This is where the rest of it lives.
 *
 * ⚠️ THE NOTICE IS RE-READ FROM THE LIST, NOT PASSED THROUGH THE ROUTE.
 * Only the `id` travels in the URL. Serialising the whole notice into params would
 * put an advisory's entire body — newlines, punctuation, whatever the portal's CMS
 * allowed — through URL encoding, and would hand this screen a stale copy that
 * cannot be refreshed. Re-reading means a deep link works, a reload works, and
 * pull-to-refresh here shows what the district is saying now rather than what it
 * said when the list was last fetched.
 *
 * The list is cheap to re-read and this is the same call the tab root makes, so
 * the cost is one request the app already knows how to make.
 */
export default function NoticeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTwdTheme();

  const { state, reload, refresh, refreshing } = useAsync(useCallback(() => listNotices(), []));

  const notice = state.status === 'ready' ? state.data.find((n) => n.id === id) : undefined;
  const accent = useToneColor(noticeTone(notice?.priority ?? 'low'));

  return (
    <ScreenContainer variant="stack" onRefresh={() => void refresh()} refreshing={refreshing}>
      {state.status === 'loading' && (
        <ScreenSection>
          <SkeletonList count={1} label="Loading notice…" />
        </ScreenSection>
      )}

      {state.status === 'error' && (
        <ScreenSection>
          <ListError
            body="Could not load this notice. Check your connection and try again."
            onRetry={() => void reload()}
          />
        </ScreenSection>
      )}

      {/*
        A notice can genuinely disappear between the list being fetched and this
        screen opening — the district can withdraw one, and a deep link can name an
        id that never existed. Reported as absent rather than as an error: nothing
        failed, the thing simply is not there any more, and "Try again" would be
        advice that cannot work.
      */}
      {state.status === 'ready' && !notice && (
        <ScreenSection>
          <ListEmpty
            title="Notice not available"
            body="This notice is no longer posted. It may have been withdrawn by Tanauan City Water District."
          />
        </ScreenSection>
      )}

      {notice && (
        <ScreenSection gap={Spacing.three}>
          <ThemedView
            type="backgroundElement"
            style={[
              styles.card,
              { borderColor: accent, borderWidth: notice.priority === 'high' ? 3 : 2 },
            ]}>
            <NoticeBadge type={notice.type} priority={notice.priority} />

            <ThemedText type="subtitle">{notice.title}</ThemedText>

            {/* No line clamp here — this screen exists precisely so the body is
                not cut off. Paragraphs are split so a multi-part advisory reads as
                separate thoughts rather than one block. */}
            {notice.content
              .split(/\n{2,}/)
              .filter((p) => p.trim())
              .map((paragraph) => (
                <ThemedText key={paragraph}>{paragraph.trim()}</ThemedText>
              ))}

            <View style={[styles.footer, { borderTopColor: theme.border }]}>
              <Icon name="calendar" size={14} color={theme.textSecondary} />
              <ThemedText type="small" themeColor="textSecondary">
                Posted {formatDate(notice.date)}
              </ThemedText>
            </View>
          </ThemedView>
        </ScreenSection>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.four, borderRadius: Radius.card, gap: Spacing.two },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingTop: Spacing.two,
    marginTop: Spacing.one,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
