import { GoogleLoginScreen } from '@/shared/auth/google-login-screen';
import { useAuth } from '@/shared/auth/auth-context';

/**
 * Standalone Google sign-in route.
 *
 * Mounted separately from /login on purpose: the email/password screen serves
 * existing TWD accounts and must not change until this flow replaces it
 * wholesale. On success the session goes to auth-context (validate + persist
 * + state entry); the root guards then route by the signed role — 'unclaimed'
 * into the claim flow, others straight into their areas.
 */
export default function GoogleLoginRoute() {
  const { signInWithGoogle } = useAuth();
  return (
    <GoogleLoginScreen
      onSuccess={(session) => {
        void signInWithGoogle(session).catch(() => {
          // adoptGoogleSession only throws after clearing a bad credential;
          // the listener has already forced sign-out. Nothing to surface here
          // that the resulting signed-out state doesn't already say.
        });
      }}
    />
  );
}
