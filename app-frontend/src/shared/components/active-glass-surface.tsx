import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

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

export function ActiveGlassSurface({
  active,
  children,
  style,
  radius = Radius.field,
}: ActiveGlassSurfaceProps) {
  const theme = useTwdTheme();
  const glassSupported = useGlassSupported();

  if (!active) {
    return <View style={[{ borderRadius: radius }, style]}>{children}</View>;
  }

  const activeFallback: ViewStyle = {
    borderRadius: radius,
    backgroundColor: theme.primarySubtle,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: theme.primary,
  };

  if (!glassSupported) {
    return <View style={[activeFallback, style]}>{children}</View>;
  }

  return (
    <GlassView
      glassEffectStyle="regular"
      tintColor={theme.primarySubtle}
      // The border survives on the glass path too — it is what carries the state
      // for anyone who can't perceive the blur itself.
      style={[
        { borderRadius: radius, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: theme.primary },
        style,
      ]}>
      {children}
    </GlassView>
  );
}

export { useGlassSupported };
