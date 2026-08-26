import Constants from 'expo-constants';
import * as AuthSession from 'expo-auth-session';
import { Platform } from 'react-native';

/**
 * Everything the Google browser flow needs before any network call happens.
 *
 * Client IDs are public identifiers (they ship in every OAuth user-agent URL);
 * no client secret may ever appear here or anywhere else in app-frontend.
 */

const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';
const ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? '';

if (!IOS_CLIENT_ID || !ANDROID_CLIENT_ID) {
  // Fail at startup, not at first tap: a missing ID would otherwise surface as
  // a Google "invalid client" page deep inside the auth browser, which reads
  // like a Google outage instead of a packaging mistake.
  throw new Error(
    'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID / EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID are not both set. ' +
      'Add them to app-frontend/.env.local and restart the Expo dev server.'
  );
}

/** The redirect Google itself accepts for iOS/Android-type clients: their own
 * client ID reversed into a custom scheme. Google auto-registers exactly this
 * URI for platform clients — arbitrary schemes cannot be added manually. */
function reverseClientId(clientId: string): string {
  return clientId.split('.').reverse().join('.');
}

/**
 * Platform-appropriate client ID and its matching redirect URI.
 *
 * Returns null rather than throwing on web: makeRedirectUri there produces an
 * https://localhost origin Google will refuse (the web client needs its own
 * registered production origin). Callers render a clear "app only" state.
 */
export function googleAuthConfig():
  | { clientId: string; redirectUri: string }
  | null {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return null;

  // Constants.expoConfig?.extra mirrors how api-client resolves the API base
  // URL — app.json values win over bare .env, keeping simulator/device setups
  // overridable without code edits.
  const clientId =
    Platform.OS === 'android'
      ? ((Constants.expoConfig?.extra?.googleAndroidClientId as string) ??
        ANDROID_CLIENT_ID)
      : ((Constants.expoConfig?.extra?.googleIosClientId as string) ?? IOS_CLIENT_ID);

  return {
    clientId,
    // `native` is honoured by dev-client and production builds (this project
    // never runs in Expo Go — BLE already requires a dev build).
    redirectUri: AuthSession.makeRedirectUri({
      native: `${reverseClientId(clientId)}:/oauthredirect`,
    }),
  };
}

/** Scopes: identity only. No Drive/contacts/etc. — least privilege, and the
 * consent screen stays legible to water-district customers. */
export const GOOGLE_SCOPES = ['openid', 'profile', 'email'];

/**
 * Static discovery document. Google's OIDC endpoints have been stable for
 * years and fetching them adds a network round trip between tapping the button
 * and the consent screen appearing; hardcoding trades nothing real and keeps
 * the first tap instant even on poor signal.
 */
export const GOOGLE_DISCOVERY: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};
