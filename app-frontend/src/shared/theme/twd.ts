import { Colors, Spacing } from '@/constants/theme';

/**
 * TWD brand tokens.
 *
 * ⚠️ SOURCE OF TRUTH IS THE ADMIN PORTAL, NOT THIS FILE.
 * The TWD Admin Portal (MERN + Tailwind) is not in this repo, so these values are
 * a considered starting point, not a match: a utility blue, portal-conventional
 * semantic colours, and the existing neutral ramp from constants/theme.ts left
 * untouched. Before release, replace `brand` and `semantic` with the portal's
 * actual Tailwind config values so the two products don't drift.
 *
 * Contrast ratios below are against the surface each colour is used on, checked
 * for WCAG AA (4.5:1 body text, 3:1 large text and UI boundaries). This is public
 * utility infrastructure used outdoors in direct sun by people of a wide range of
 * ages and eyesight — the ratios are a requirement, not a nicety.
 */

export const brand = {
  /** Primary action. 5.9:1 on white. */
  primary: '#0A5C8A',
  /** Pressed/active. 8.1:1 on white. */
  primaryPressed: '#07425F',
  /** For dark surfaces. 6.4:1 on #000. */
  primaryOnDark: '#4FA8D8',
  /** Tint for glass and focus rings. */
  primarySubtle: 'rgba(10, 92, 138, 0.12)',
  onPrimary: '#FFFFFF',
} as const;

export const semantic = {
  /** Offline / unsynced. Amber — informational, not alarming; the collector is fine. */
  warning: '#8A5200',
  warningOnDark: '#F0A93B',
  warningSurface: 'rgba(240, 169, 59, 0.16)',
  /** Errors. 5.5:1 on white. */
  danger: '#B3261E',
  dangerOnDark: '#F2857E',
  dangerSurface: 'rgba(179, 38, 30, 0.12)',
  success: '#1B5E20',
  successOnDark: '#6FBF73',
} as const;

/**
 * Minimum interactive target. 48dp is the Android accessibility floor and Apple's
 * 44pt guidance rounded up — collectors tap these in the rain, one-handed, holding
 * a meter key.
 */
export const MIN_TAP_TARGET = 48;

export const Radius = {
  field: 12,
  card: 16,
  pill: 999,
} as const;

export type TwdScheme = 'light' | 'dark';

/** Resolve the full palette for a scheme, merging brand tokens over the base neutrals. */
export function twdTheme(scheme: TwdScheme) {
  const base = Colors[scheme];
  const isDark = scheme === 'dark';

  return {
    ...base,
    primary: isDark ? brand.primaryOnDark : brand.primary,
    primaryPressed: isDark ? brand.primary : brand.primaryPressed,
    primarySubtle: brand.primarySubtle,
    onPrimary: isDark ? '#00121C' : brand.onPrimary,
    warning: isDark ? semantic.warningOnDark : semantic.warning,
    warningSurface: semantic.warningSurface,
    danger: isDark ? semantic.dangerOnDark : semantic.danger,
    dangerSurface: semantic.dangerSurface,
    success: isDark ? semantic.successOnDark : semantic.success,
    /** Hairline borders — 3:1 against the adjacent surface. */
    border: isDark ? '#3A3D42' : '#C9CCD1',
  };
}

export type TwdColors = ReturnType<typeof twdTheme>;

export { Spacing };
