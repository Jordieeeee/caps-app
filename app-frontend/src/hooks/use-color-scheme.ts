/**
 * The OS colour scheme — the *system* value, not necessarily the one the app draws.
 *
 * Since the appearance setting landed, screens no longer call this: they resolve
 * through `useResolvedScheme()` in shared/theme/theme-preference.tsx, which layers
 * the user's own Light/Dark/System choice over this. This is the input to that
 * decision and should stay the only place the platform is asked.
 */
export { useColorScheme } from 'react-native';
