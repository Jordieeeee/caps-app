import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';

import { useTwdTheme } from '@/shared/hooks/use-twd-theme';

/**
 * The district's seal, held still, inside a ring that turns.
 *
 * Motion in this app means exactly one thing — the app is working on it — which
 * is the same rule the offline banner follows by deliberately NOT animating.
 * This is the other side of that rule: a screen that really is waiting says so
 * with the one moving thing on it.
 *
 * The MARK does not spin. A rotating logo is a logo you cannot read, and this
 * one carries the district's name; it is the reason a consumer knows whose app
 * asked them to wait. Only the ring moves, which is also why the ring is drawn
 * separately rather than being part of the image.
 */

const TWD_MARK = require('../../../assets/images/icon.png');

export function TwdLoader({
  size = 72,
  label,
}: {
  size?: number;
  /** Announced to screen readers. The visible caption is the caller's job. */
  label?: string;
}) {
  const theme = useTwdTheme();
  // useState with a lazy initialiser, not useRef().current — the value must be
  // created once and survive re-renders, and reading a ref during render is
  // exactly what react-hooks/refs forbids.
  const [spin] = useState(() => new Animated.Value(0));
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      if (alive) setReduceMotion(on);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) return;

    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1100,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [spin, reduceMotion]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const ring = Math.max(3, Math.round(size * 0.055));

  return (
    <View
      style={[styles.wrap, { width: size, height: size }]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? 'Loading'}>
      <Animated.View
        style={[
          styles.ring,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: ring,
            // Three sides faint, one solid: the gap is what makes rotation
            // legible. A ring of even colour turning looks like nothing at all.
            borderColor: theme.border,
            borderTopColor: theme.primary,
            // With reduced motion the ring still renders, as a static frame
            // rather than a trick — the caption below it carries the meaning.
            transform: reduceMotion ? [] : [{ rotate }],
          },
        ]}
      />
      <Image
        source={TWD_MARK}
        style={{ width: size * 0.58, height: size * 0.58 }}
        contentFit="contain"
        // Decorative here: accessibilityLabel on the wrapper already says what
        // is happening, and a screen reader announcing the seal twice is noise.
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute' },
});
