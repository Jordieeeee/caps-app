import { Platform, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface Announcement {
  id: string;
  title: string;
  type: 'service-update' | 'advisory' | 'interruption';
  date: string;
  content: string;
  priority: 'low' | 'medium' | 'high';
}

const mockAnnouncements: Announcement[] = [
  {
    id: '1',
    title: 'Scheduled Water Maintenance',
    type: 'interruption',
    date: '2025-07-20',
    content: 'Water service will be temporarily interrupted on July 20th from 2:00 AM to 6:00 AM for scheduled maintenance in the Downtown area.',
    priority: 'high',
  },
  {
    id: '2',
    title: 'Water Quality Advisory',
    type: 'advisory',
    date: '2025-07-18',
    content: 'Recent water quality tests indicate elevated levels of sediment. This is not a health concern but may affect water clarity. We are working to resolve this issue.',
    priority: 'medium',
  },
  {
    id: '3',
    title: 'Service Update: New Online Portal',
    type: 'service-update',
    date: '2025-07-15',
    content: 'We have launched a new online portal for easier account management and bill payment. Log in to your account to explore the new features.',
    priority: 'low',
  },
];

function getPriorityColor(priority: string, theme: any) {
  switch (priority) {
    case 'high':
      return '#FF3B30';
    case 'medium':
      return '#FF9500';
    case 'low':
      return '#34C759';
    default:
      return theme.text;
  }
}

function getTypeIcon(type: string) {
  switch (type) {
    case 'interruption':
      return '⚠️';
    case 'advisory':
      return 'ℹ️';
    case 'service-update':
      return '🔧';
    default:
      return '📢';
  }
}

export default function AnnouncementsScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const insets = {
    ...safeAreaInsets,
    bottom: safeAreaInsets.bottom + BottomTabInset + Spacing.three,
  };
  const theme = useTheme();

  const contentPlatformStyle = Platform.select({
    android: {
      paddingTop: insets.top,
      paddingLeft: insets.left,
      paddingRight: insets.right,
      paddingBottom: insets.bottom,
    },
    web: {
      paddingTop: Spacing.six,
      paddingBottom: Spacing.four,
    },
  });

  return (
    <ScrollView
      style={[styles.scrollView, { backgroundColor: theme.background }]}
      contentInset={insets}
      contentContainerStyle={[styles.contentContainer, contentPlatformStyle]}>
      <ThemedView style={styles.container}>
        <ThemedView style={styles.titleContainer}>
          <ThemedText type="subtitle">Announcements</ThemedText>
          <ThemedText style={styles.centerText} themeColor="textSecondary">
            Stay informed about water district updates, advisories, and scheduled interruptions.
          </ThemedText>
        </ThemedView>

        <ThemedView style={styles.announcementsWrapper}>
          {mockAnnouncements.map((announcement) => (
            <ThemedView
              key={announcement.id}
              type="backgroundElement"
              style={styles.announcementCard}>
              <ThemedView style={styles.cardHeader}>
                <ThemedText style={styles.typeIcon}>
                  {getTypeIcon(announcement.type)}
                </ThemedText>
                <ThemedView style={styles.headerText}>
                  <ThemedText type="defaultBold" style={styles.cardTitle}>
                    {announcement.title}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {announcement.date}
                  </ThemedText>
                </ThemedView>
                <ThemedView
                  style={[
                    styles.priorityBadge,
                    { backgroundColor: getPriorityColor(announcement.priority, theme) + '20' },
                  ]}>
                  <ThemedText
                    type="small"
                    style={[
                      styles.priorityText,
                      { color: getPriorityColor(announcement.priority, theme) },
                    ]}>
                    {announcement.priority.toUpperCase()}
                  </ThemedText>
                </ThemedView>
              </ThemedView>
              <ThemedText type="small" style={styles.cardContent}>
                {announcement.content}
              </ThemedText>
            </ThemedView>
          ))}
        </ThemedView>
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  container: {
    maxWidth: MaxContentWidth,
    flexGrow: 1,
  },
  titleContainer: {
    gap: Spacing.three,
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.six,
  },
  centerText: {
    textAlign: 'center',
  },
  announcementsWrapper: {
    gap: Spacing.four,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  announcementCard: {
    borderRadius: Spacing.three,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  typeIcon: {
    fontSize: 24,
  },
  headerText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
  },
  priorityBadge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.two,
  },
  priorityText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  cardContent: {
    lineHeight: 20,
  },
});
