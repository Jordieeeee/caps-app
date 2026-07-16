import { useRouter } from 'expo-router';

import { ScreenMessage } from '@/shared/components/screen-message';

/**
 * Password recovery.
 *
 * This screen explains a process rather than starting one, and that is not a
 * placeholder: the API exposes no reset endpoint (see app-backend authRoutes.js —
 * register, login, refresh, logout, me), so there is nothing for a form here to
 * submit to. Shipping an email field that silently did nothing would be worse than
 * shipping no field, so this states the recovery path that actually exists today.
 *
 * It matches how the accounts work either way: staff credentials are issued by the
 * TWD office, so staff recovery was always going to be a phone call. Only consumer
 * self-service reset needs building, and it needs a backend endpoint plus a mail
 * sender before this screen can grow a form.
 */
export default function ForgotPasswordScreen() {
  const router = useRouter();

  return (
    <ScreenMessage
      tone="neutral"
      title="Resetting your password"
      body={
        'Passwords are reset by the Tanauan City Water District office. Visit the office or call during business hours, and bring a valid ID or your account number so staff can verify who you are.\n\nTWD staff: contact your supervisor or the office directly to have your account password reset.'
      }
      action={{ label: 'Back to sign in', onPress: () => router.back() }}
    />
  );
}
