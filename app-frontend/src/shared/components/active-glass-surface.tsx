import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { Radius } from '@/shared/theme/twd';

/**
 * Is the native liquid-glass effect actually going to render?
 *
 * Three ways this is false, and all of them matter:
 *  - Android: expo-glass-effect's non-iOS GlassView is literally `<View {...props} />`
 *    with no treatment at all. TWD's collectors are overwhelmingly on Android.
 *  - iOS < 26, and some iOS 26 betas where touching the API crashes.
 *  - Reduce Transparency: a user has explicitly asked the OS for less of this.
 *
 * So glass can never BE the state signal — it can only decorate one. Everything
 * below keeps a solid, opaque active treatment underneath and lets glass ride on
 * top where it exists. On a Pixel in a barangay, the solid treatment is the state.
 */
function useGlassSupported(): boolean {
  const [reduceTransparency, setReduceTransparency] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceTransparencyEnabled().then((enabled) => {
      if (active) setReduceTransparency(enabled);
    });
    const sub = AccessibilityInfo.addEventListener('reduceTransparencyChanged', (enabled) =>
      setReduceTransparency(enabled)
    );
    return () => {
      active = false;
      sub.remove();
    };
  }, []);

  return isLiquidGlassAvailable() && isGlassEffectAPIAvailable() && !reduceTransparency;
}

/**
 * A whole number, not `StyleSheet.hairlineWidth * 2`.
 *
 * The old value came to 0.714dp on a 280dpi phone. Sub-pixel border widths are
 * unreliable on Android, and 1dp still reads as a hairline at every density this
 * app ships to.
 */
const ACTIVE_BORDER_WIDTH = 1;

interface ActiveGlassSurfaceProps {
  /**
   * Whether the element is in its active/focused/pressed state.
   *
   * Glass appears only while this is true. It is a state signal, not decoration:
   * a screen where everything is frosted tells the user nothing about what they
   * are touching.
   */
  active: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Border radius must match the host control so the effect doesn't bleed past it. */
  radius?: number;
}

/**
 * ⚠️ `collapsable={false}` ON EVERY BRANCH. REMOVING IT CRASHES ANDROID.
 *
 * Fabric erases a View from the native tree when its style is layout-only, and
 * re-creates it the moment the style becomes visually relevant. This component
 * crosses that line on every press: idle it is `borderRadius` alone (flattened
 * away), active it gains a background and a border (a real view). Flattening does
 * not just add or remove that view — it RE-PARENTS its children into the
 * grandparent, and Fabric can issue the insert before the old parent has let go:
 *
 *     addViewAt: cannot insert view [6100] into parent [6106]:
 *       View already has a parent: [6102]
 *       Parent: ReactViewGroup  View: ReactTextView
 *
 * Read off the device, 6102 was TwdButton's body (an ActivityIndicator and the
 * label) and 6106 was this surface. React wanted the label as a DIRECT child of
 * this view at index 2, which is only true if 6102 had been flattened out from
 * under it.
 *
 * Why it looked like a printing bug: `busy` and `pressed` change together the
 * instant Save & Print is tapped — the icon becomes a spinner and `active` goes
 * false in the same commit — so the flatten and the unflatten land in one mount
 * batch. The paper prints fine; the crash is this view being erased underneath
 * its own children.
 *
 * `collapsable={false}` pins a real native view on every branch, so there is
 * nothing to flatten and nothing to re-parent.
 */
export function ActiveGlassSurface({
  active,
  children,
  style,
  radius = Radius.field,
}: ActiveGlassSurfaceProps) {
  const theme = useTwdTheme();
  const glassSupported = useGlassSupported();

  /**
   * ⚠️ THE PILL SENTINEL HAS TO BE RESOLVED TO A REAL NUMBER BEFORE ANDROID SEES IT.
   *
   * `Radius.pill` is 999 — a "fully rounded" sentinel, not a measurement. iOS
   * clamps it to the box and draws a pill. Android clamps the FILL but gives up on
   * the BORDER and falls back to a rect, so a pressed pill button came out as a
   * rounded fill inside a square outline, with the outline's corners sticking out
   * past the button. Confirmed on device: thickening this border to 6dp drew a
   * thick square, and the child pill — same 999 — stayed perfectly round, so the
   * radius value was never the problem, only the border's handling of it.
   *
   * So measure the box and clamp the way the platform should have. Half the
   * shorter side is exactly "fully rounded" and is a value both platforms draw.
   *
   * The measurement is taken on the INACTIVE view too, which is the one mounted
   * the whole time the control is idle. Measuring only while active would land the
   * first pressed frame with an unclamped radius — one square flash per press,
   * which is the bug in miniature.
   */
  const [box, setBox] = useState({ width: 0, height: 0 });
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setBox((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
  }, []);

  const shortestSide = Math.min(box.width, box.height);
  const drawnRadius = shortestSide > 0 ? Math.min(radius, shortestSide / 2) : radius;

  if (!active) {
    return (
      <View collapsable={false} onLayout={onLayout} style={[{ borderRadius: drawnRadius }, style]}>
        {children}
      </View>
    );
  }

  const activeFallback: ViewStyle = {
    borderRadius: drawnRadius,
    backgroundColor: theme.primarySubtle,
    borderWidth: ACTIVE_BORDER_WIDTH,
    borderColor: theme.primary,
  };

  if (!glassSupported) {
    return (
      <View collapsable={false} onLayout={onLayout} style={[activeFallback, style]}>
        {children}
      </View>
    );
  }

  return (
    <GlassView
      glassEffectStyle="regular"
      tintColor={theme.primarySubtle}
      onLayout={onLayout}
      // The border survives on the glass path too — it is what carries the state
      // for anyone who can't perceive the blur itself.
      style={[
        { borderRadius: drawnRadius, borderWidth: ACTIVE_BORDER_WIDTH, borderColor: theme.primary },
        style,
      ]}>
      {children}
    </GlassView>
  );
}

export { useGlassSupported };
