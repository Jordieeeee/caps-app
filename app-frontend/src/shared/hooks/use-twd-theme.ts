import { useResolvedScheme } from '@/shared/theme/theme-preference';
import { twdTheme, type TwdColors } from '@/shared/theme/twd';

/**
 * TWD palette for the active colour scheme.
 *
 * Mirrors the existing hooks/use-theme.ts, which returns only the base neutrals;
 * this one adds the brand and semantic tokens on top. Both resolve the scheme
 * through the same hook, so the two never disagree about what "dark" means — and
 * an in-app theme choice moves both at once.
 */
export function useTwdTheme(): TwdColors {
  return twdTheme(useResolvedScheme());
}
