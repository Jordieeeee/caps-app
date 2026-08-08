/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/theme';
import { useResolvedScheme } from '@/shared/theme/theme-preference';

/**
 * Base neutrals for the active scheme.
 *
 * Resolves through the theme preference rather than `useColorScheme()` directly,
 * so an in-app Light/Dark choice reaches every screen without any of them knowing
 * about it. `useResolvedScheme` returns the OS value when no preference has been
 * set — the previous behaviour, unchanged.
 */
export function useTheme() {
  return Colors[useResolvedScheme()];
}
