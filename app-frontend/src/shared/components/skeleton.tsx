import { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';

import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { Radius, Spacing } from '@/shared/theme/twd';

/**
 * Placeholder shapes for content that is loading.
 *
 * The skill's loading guidance is High severity and specific — "Use skeleton
 * screens or spinners / Don't: leave UI frozen with no feedback", with
 * `animate-pulse skeleton` as the good example. A skeleton beats a spinner for a
 * list specifically because it reserves the space the rows will occupy, so the
 * screen does not jump when they arrive; that is the same content-jumping rule the
 * layout guidance names separately.
 *
 * Reduced motion is honoured, and here that matters more than usual: the pulse is
 * the only ambient animation in the collector module, and a collector who has
 * asked the OS for less motion is telling us something about how they read a
 * screen in the field. With it on, the shapes render static — still reserving
 * space, still saying "not yet", just not breathing.
 */

function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setReduce(enabled);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      active = false;
      sub.remove();
    };
  }, []);

  return reduce;
}

export function SkeletonBlock({
  height = 16,
  width = '100%',
  style,
}: {
  height?: number;
  width?: ViewStyle['width'];
  style?: ViewStyle;
}) {
  const theme = useTwdTheme();
  const reduceMotion = useReduceMotion();
  const opacity = useSharedValue(reduceMotion ? 0.6 : 0.35);

  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(opacity);
      opacity.value = 0.6;
      return;
    }
    // 900ms each way. Slow enough to read as breathing rather than blinking, and
    // well outside the 150-300ms micro-interaction band — this is ambient, not a
    // response to a tap.
    opacity.value = withRepeat(withTiming(0.7, { duration: 900 }), -1, true);
    return () => cancelAnimation(opacity);
  }, [reduceMotion, opacity]);

  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        { height, width, backgroundColor: theme.backgroundSelected, borderRadius: Radius.field },
        animated,
        style,
      ]}
    />
  );
}

/**
 * A stand-in for one list card, shaped like the cards it precedes.
 *
 * Announced once, at the list level, rather than per row — a screen reader user
 * does not need to hear "loading" four times.
 */
export function SkeletonCard() {
  const theme = useTwdTheme();

  return (
    <View
      style={[styles.card, { backgroundColor: theme.backgroundElement }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <View style={styles.row}>
        <SkeletonBlock height={18} width="45%" />
        <SkeletonBlock height={18} width={72} />
      </View>
      <SkeletonBlock height={28} width="55%" />
      <SkeletonBlock height={12} width="80%" />
    </View>
  );
}

export function SkeletonList({ count = 3, label = 'Loading…' }: { count?: number; label?: string }) {
  return (
    <View style={styles.list} accessibilityRole="progressbar" accessibilityLabel={label}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.three },
  card: {
    borderRadius: Radius.card,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
