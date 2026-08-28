import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { useCollectorIdentity } from '@/collector/collector-identity';
import { getPasswordState } from '@/shared/auth/credential';
import { SetPasswordForm } from '@/shared/auth/set-password-form';
import { ListError, ListLoading } from '@/shared/components/list-states';
import { ScreenContainer, ScreenSection } from '@/shared/components/screen-container';
import { useAsync } from '@/shared/hooks/use-async';

/**
 * Collector: set or change the password that signs in without Google.
 *
 * Same credential, same endpoint and the same form as the consumer's screen
 * (shared/auth/set-password-form) — this file supplies the identity and states the
 * collector's version of the stakes.
 *
 * Those stakes are higher, which is why this is not just symmetry. A consumer
 * locked out of their Google account loses sight of their bills until the office
 * can help. A COLLECTOR locked out is standing in a barangay holding a phone with
 * unsent readings on it: the work is captured, the outbox needs an authenticated
 * session to drain, and the office cannot hand them a Google account back over the
 * phone. A second way in is worth more here than anywhere else in the app.
 *
 * ⚠️ It asks for the CREDENTIAL STATE, not the employment record. This screen
 * originally loaded the full profile — which for a collector resolves the scope,
 * reads the registry twice and counts every reading they have ever filed, about a
 * second of sequential round trips — to display an email address it already had in
 * the session and two booleans. The email comes from the identity provider, which
 * resolved once for the whole shell and costs nothing here.
 */
export default function CollectorSetPasswordScreen() {
  const router = useRouter();
  const { collector } = useCollectorIdentity();
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

  /**
   * No cached fallback here, deliberately, and it is the one screen in the
   * collector app that says so plainly. Everything else this app does works
   * offline because field work cannot wait; setting a password cannot, because
   * the password is useless until TWD has it. Saying "no connection" is honest;
   * drawing a form that will fail on submit is not.
   */
  if (state.status === 'error') {
    return (
      <ScreenContainer variant="stack">
        <ScreenSection>
          <ListError
            title="No connection to TWD"
            body="Setting a password needs a connection so TWD can store it. Try again when you have signal — the readings on this phone are unaffected."
            onRetry={reload}
          />
        </ScreenSection>
      </ScreenContainer>
    );
  }

  /**
   * A seeded or portal collector has a credential already, and it is the office's.
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
            body="This account already signs in with an email and password. To change it, ask the Tanauan City Water District office."
            onRetry={reload}
          />
        </ScreenSection>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer variant="stack">
      <SetPasswordForm
        email={collector.email}
        hasPassword={state.data.hasPassword}
        note="Worth doing before your next route: if you ever lose your Google account, this is how you sign back in and send the readings saved on this phone."
        onDone={() => router.back()}
      />
    </ScreenContainer>
  );
}
