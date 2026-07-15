import { useColorScheme } from '@/hooks/use-color-scheme';
import { twdTheme, type TwdColors } from '@/shared/theme/twd';

/**
 * TWD palette for the active colour scheme.
 *
 * Mirrors the existing hooks/use-theme.ts, which returns only the base neutrals;
 * this one adds the brand and semantic tokens on top. Same scheme-resolution rule,
 * so the two never disagree about what "dark" means.
 */
export function useTwdTheme(): TwdColors {
  const scheme = useColorScheme();
  return twdTheme(scheme === 'unspecified' || !scheme ? 'light' : scheme);
}
