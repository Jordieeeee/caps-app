import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth } from '@/constants/theme';
import { useAuth, useSession } from '@/shared/auth/auth-context';
import { TwdButton } from '@/shared/components/twd-button';
import { Radius, Spacing } from '@/shared/theme/twd';

export default function ConsumerHome() {
  const { session } = useSession();
  const { signOut } = useAuth();
  const insets = useSafeAreaInsets();

  // Always an array. Consumers may link several water accounts up to a
  // server-enforced cap, so nothing here assumes a single "current" account.
  const accounts = session.user.accountNumbers ?? [];

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
              Welcome back
            </ThemedText>
            <ThemedText type="subtitle">{session.user.name}</ThemedText>
          </View>

          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="defaultBold">
              {accounts.length === 1 ? 'Linked account' : 'Linked accounts'}
            </ThemedText>
            {accounts.length ? (
              accounts.map((account) => (
                <ThemedText key={account} themeColor="textSecondary">
                  {account}
                </ThemedText>
              ))
            ) : (
              <ThemedText themeColor="textSecondary">
                You have not linked a water account yet. Link one to see your bills.
              </ThemedText>
            )}
          </ThemedView>

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
});
