import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomTabInset, Spacing } from '@/constants/theme';

/**
 * Padding a tabbed screen's scroll content needs to clear the chrome.
 *
 * Every collector and consumer screen was computing this by hand and getting a
 * different answer per platform. The pattern was:
 *
 *     <ScrollView
 *       contentInset={insets}                                  // iOS only
 *       contentContainerStyle={[s, Platform.select({ android: {...}, web: {...} })]}
 *
 * `contentInset` is an iOS-only prop — on Android and web it is silently ignored,
 * so the same value had to be re-expressed as padding in `Platform.select`, which
 * then handled `android` and `web` but left iOS to the contentInset path. Three
 * platforms, three mechanisms, one number. `BottomTabInset` also resolves to 0 on
 * web (`Platform.select({ ios, android }) ?? 0`) while NativeTabs still renders a
 * tab bar there, so web content ran under the bar with nothing reserved for it.
 *
 * This returns plain padding instead. `contentContainerStyle` padding works
 * identically on all three platforms, so there is one mechanism and one number.
 *
 * ⚠️ `BottomTabInset` remains a hardcoded estimate of a *native* tab bar's height.
 * NativeTabs renders the platform's own bar (UITabBar / BottomNavigationView) and
 * exposes no height to JS — expo-router's `useBottomTabBarHeight` only works under
 * the JS BottomTabNavigator and throws here. The estimate is generous enough to
 * cover the current bars, but it is an estimate: verify on device after changing
 * tab count, icon size, or minimum OS version.
 */
export function useContentInsets() {
  const safeArea = useSafeAreaInsets();

  return {
    paddingTop: safeArea.top,
    paddingLeft: safeArea.left,
    paddingRight: safeArea.right,
    paddingBottom: safeArea.bottom + BottomTabInset + Spacing.three,
  };
}

/**
 * As above, for screens that want their own top spacing (a title block that should
 * breathe below the notch rather than sit against it).
 */
export function useContentInsetsWithTopSpacing(extraTop: number = Spacing.four) {
  const insets = useContentInsets();
  return { ...insets, paddingTop: insets.paddingTop + extraTop };
}

/**
 * For screens inside a Stack with a visible navigation header (the More stack).
 *
 * The header already absorbs the top safe area, so adding `safeArea.top` again —
 * which the old per-screen `Platform.select` pattern did on Android — pushed
 * content a full status-bar height below the header. Top padding here is plain
 * breathing room. The bottom reservation is unchanged: the tab bar stays visible
 * under nested stack screens, so they need to clear it like everyone else.
 */
export function useStackContentInsets() {
  const safeArea = useSafeAreaInsets();

  return {
    paddingTop: Spacing.four,
    paddingLeft: safeArea.left,
    paddingRight: safeArea.right,
    paddingBottom: safeArea.bottom + BottomTabInset + Spacing.three,
  };
}
