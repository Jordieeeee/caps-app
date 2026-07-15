import { Stack } from 'expo-router';

/**
 * Auth routes. Grouped in parentheses so they stay at /login and /enroll rather
 * than /auth/login — the URL a consumer might be sent in a text message should be
 * the short one.
 */
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
