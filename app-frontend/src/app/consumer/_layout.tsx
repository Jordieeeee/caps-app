import { Redirect } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import ConsumerTabs from '@/consumer/navigation/consumer-tabs';
import { useAuth } from '@/shared/auth/auth-context';

/**
 * Consumer shell.
 *
 * Note what is absent: there is no offline banner here, because there is no
 * offline consumer session for one to describe. A consumer only reaches these
 * screens after a live call succeeded; if connectivity drops afterwards, that is
 * a per-screen data-fetch problem for those screens to report, not a session
 * state. Adding a banner here would be the first step toward quietly giving the
 * consumer path the offline tolerance it is specifically not supposed to have.
 */
export default function ConsumerLayout() {
  const { state } = useAuth();

  if (state.status !== 'signedIn' || state.role !== 'Consumer') {
    return <Redirect href="/" />;
  }

  return (
    <View style={styles.container}>
      <ConsumerTabs />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
