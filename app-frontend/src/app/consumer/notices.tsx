import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { listNotices, type Notice } from '@/consumer/services/consumer-data';
import { Icon } from '@/shared/components/icon';
import { ListEmpty, ListError, ListLoading } from '@/shared/components/list-states';
import { ScreenContainer, ScreenSection } from '@/shared/components/screen-container';
import { ScreenHeader } from '@/shared/components/screen-header';
import { NoticeBadge, noticeTone, useToneColor } from '@/shared/components/status-badge';
import { useAsync } from '@/shared/hooks/use-async';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { Radius, Spacing } from '@/shared/theme/twd';

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
  const { state, reload } = useAsync(useCallback(() => listNotices(), []));

  return (
    <ScreenContainer>
      <ScreenHeader title="Notices" subtitle="Service updates from Tanauan City Water District" />

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
