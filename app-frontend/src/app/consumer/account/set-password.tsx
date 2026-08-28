import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { useIdentity } from '@/shared/auth/auth-context';
import { getPasswordState } from '@/shared/auth/credential';
import { SetPasswordForm } from '@/shared/auth/set-password-form';
import { ListError, ListLoading } from '@/shared/components/list-states';
import { ScreenContainer, ScreenSection } from '@/shared/components/screen-container';
import { useAsync } from '@/shared/hooks/use-async';

/**
 * Consumer: set or change the password that signs in without Google.
 *
 * The form is shared with the collector's screen (shared/auth/set-password-form) —
 * one credential, one endpoint, one form. This file supplies the identity and the
 * consumer's version of the stakes.
 *
 * Offered from Account settings rather than as a step in the claim flow,
 * deliberately. Claiming is the one flow whose whole promise is "one tap, no
 * password to invent", and this is the screen someone comes looking for at the
 * moment they actually need it: when Google has stopped being convenient. It is
 * optional, and nothing anywhere blocks on it.
 *
 * ⚠️ It asks for the CREDENTIAL STATE, not the registry profile. Loading the whole
 * profile to draw this form meant reading the consumer's registry document and
 * their portal credential to display an email the session already holds. The email
 * comes from `useIdentity`, which costs nothing.
 */
export default function ConsumerSetPasswordScreen() {
  const router = useRouter();
  const { email } = useIdentity();
  const { state, reload } = useAsync(useCallback(() => getPasswordState(), []));

  if (state.status === 'loading') {
    return (
      <ScreenContainer variant="stack">
        <ScreenSection>
          <ListLoading label="Loading…" />
        </ScreenSection>
      </ScreenContainer>
    );
  }

  if (state.status === 'error') {
    return (
      <ScreenContainer variant="stack">
        <ScreenSection>
          <ListError
            title="Could not reach TWD"
            body="Setting a password needs a connection so the district can store it. Check your connection and try again."
            onRetry={reload}
          />
        </ScreenSection>
      </ScreenContainer>
    );
  }

  /**
   * A password consumer has one already, and it is the office's to change.
   *
   * Reachable only by deep link — the row that opens this screen is hidden for
   * them — but a screen that can be reached has to answer for itself rather than
   * offering a form whose every submission the server will refuse.
   */
  if (!state.data.canSetPassword) {
    return (
      <ScreenContainer variant="stack">
        <ScreenSection>
          <ListError
            title="Your password is managed by the office"
            body="This account already signs in with an email and password. To change it, contact the Tanauan City Water District office."
            onRetry={reload}
          />
        </ScreenSection>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer variant="stack">
      <SetPasswordForm
        email={email}
        hasPassword={state.data.hasPassword}
        onDone={() => router.back()}
      />
    </ScreenContainer>
  );
}
