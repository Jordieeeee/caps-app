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

  /**
   * BOTH consumer identities, deliberately.
   *
   * This guard used to admit only the password session (status 'signedIn',
   * role 'Consumer'). The root layout's guard had already been widened to
   * `role === 'Consumer' || googleRole === 'consumer'`, so after a successful
   * claim the two disagreed: the root mounted this route, this layout bounced
   * to '/', index.tsx sent it straight back to '/consumer', and the two
   * redirects ping-ponged until React gave up with "Maximum update depth
   * exceeded". Any guard on this route must accept exactly what the root
   * guard accepts or the same loop returns.
   *
   * Note the casing is not a typo: the password system's roles are
   * capitalised ('Consumer') and the Google flow's are lowercase
   * ('consumer') — see types/auth.ts and types/google-auth.ts.
   */
  const isConsumer =
    (state.status === 'signedIn' && state.role === 'Consumer') ||
    (state.status === 'googleSignedIn' && state.role === 'consumer');

  if (!isConsumer) {
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
