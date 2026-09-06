/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#000000',
    background: '#ffffff',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

/**
 * Height to reserve for the bottom tab bar.
 *
 * Web was previously falling through the `?? 0` and reserving nothing, even though
 * NativeTabs renders a tab bar there too — so web content ran under the bar. Every
 * platform that draws a tab bar now names a value.
 *
 * These are estimates: NativeTabs renders the platform's own bar and reports no
 * height to JS. Re-measure on device if the tab count or minimum OS version moves.
 */
/**
 * The Android tab bar's own height, and the gap it keeps from the screen edges.
 *
 * ⚠️ DECLARED HERE, NOT IN app-tab-bar.tsx, AND THE DIRECTION MATTERS. The bar
 * needs `Spacing`/`Radius` from shared/theme/twd, and twd reads its palette from
 * this file — so a constant living in the component and imported back into here
 * closes the cycle theme.ts → app-tab-bar → twd → theme.ts. Metro resolves that by
 * handing one of them a half-evaluated module, and the app dies on launch with
 * `Cannot read property 'one' of undefined` pointing at a line that is fine.
 *
 * Constants at the bottom of the graph, components at the top.
 */
export const FLOATING_BAR_HEIGHT = 62;
export const FLOATING_BAR_MARGIN = 12;

/**
 * Space a scrolling screen reserves so its last row clears the tab bar.
 *
 * ⚠️ ANDROID IS DERIVED, NOT GUESSED. The Android bar is now a React view that
 * FLOATS over the content (see shared/components/app-tab-bar.tsx), so the space it
 * needs is its own height plus the gap it keeps from the screen edge — and both of
 * those are exported from that file, so changing the bar's height cannot leave
 * this number stale behind it.
 *
 * iOS and web stay estimates of a NATIVE bar's height, which is what they still
 * render. UITabBar exposes no height to JS under NativeTabs (expo-router's
 * `useBottomTabBarHeight` only works under the JS navigator and throws there), so
 * those two remain measured-by-eye and want re-checking on device after any change
 * to tab count or minimum OS version.
 */
export const BottomTabInset =
  Platform.select({
    ios: 50,
    android: FLOATING_BAR_HEIGHT + FLOATING_BAR_MARGIN * 2,
    web: 64,
  }) ?? 0;
export const MaxContentWidth = 800;
