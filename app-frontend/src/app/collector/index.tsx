import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth } from '@/constants/theme';
import { useAuth, useSession } from '@/shared/auth/auth-context';
import { TwdButton } from '@/shared/components/twd-button';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { Radius, Spacing } from '@/shared/theme/twd';

export default function CollectorHome() {
  const { session, sync } = useSession();
  const { signOut } = useAuth();
  const theme = useTwdTheme();
  const insets = useSafeAreaInsets();

  const routes = session.user.routeIds ?? [];

  return (
    <ThemedView style={styles.root}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + Spacing.four, paddingBottom: insets.bottom + BottomTabInset },
        ]}>
        <View style={styles.content}>
          <View style={styles.header}>
            <ThemedText type="small" themeColor="textSecondary">
              Signed in as collector
            </ThemedText>
            <ThemedText type="subtitle">{session.user.name}</ThemedText>
          </View>

          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="defaultBold">Assigned routes</ThemedText>
            <ThemedText themeColor="textSecondary">
              {routes.length ? routes.join(', ') : 'No routes assigned yet.'}
            </ThemedText>
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="defaultBold">Session</ThemedText>
            <ThemedText themeColor="textSecondary">
              {sync === 'online'
                ? 'Connected. Your work syncs as you go.'
                : sync === 'offline'
                  ? 'No connection. Your work is saved on this device.'
                  : 'Sign-in not reconfirmed. Your work is saved on this device.'}
            </ThemedText>
          </ThemedView>

          <View
            style={[styles.warning, { borderColor: theme.border }]}
            accessible
            accessibilityRole="summary">
            <ThemedText type="small" themeColor="textSecondary">
              Signing out clears this device&apos;s saved session. You will need a
              connection to sign back in — avoid signing out mid-route.
            </ThemedText>
          </View>

          <TwdButton label="Sign out" variant="secondary" onPress={() => void signOut()} />
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1, alignItems: 'center', paddingHorizontal: Spacing.four },
  content: { width: '100%', maxWidth: MaxContentWidth, gap: Spacing.three },
  header: { gap: Spacing.one, marginBottom: Spacing.two },
  card: { padding: Spacing.four, borderRadius: Radius.card, gap: Spacing.two },
  warning: {
    padding: Spacing.three,
    borderRadius: Radius.card,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
});
