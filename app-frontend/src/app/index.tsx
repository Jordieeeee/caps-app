import { Redirect } from 'expo-router';

import { useAuth } from '@/shared/auth/auth-context';
import { ScreenLoading } from '@/shared/components/screen-message';

/**
 * Landing route. Sends each user to the app their token says they belong in.
 *
 * The switch is on the decoded role and nothing else. There is deliberately no
 * default branch: an unrecognised role must not quietly land somewhere plausible.
 * Admin and anything else never reach here — session-restore rejects the token and
 * returns the user to the login screen with an explanation.
 */
export default function Index() {
  const { state } = useAuth();

  if (state.status === 'restoring' || state.status === 'authenticating') {
    return <ScreenLoading label="Signing you in…" />;
  }

  if (state.status !== 'signedIn') {
    return <Redirect href="/login" />;
  }

  switch (state.role) {
    case 'Collector':
      return <Redirect href="/collector" />;
    case 'Consumer':
      return <Redirect href="/consumer" />;
  }
}
