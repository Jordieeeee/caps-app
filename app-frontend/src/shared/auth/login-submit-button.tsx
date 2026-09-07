import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { registerSubmitAnchor } from '@/shared/auth/login-transition';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { MIN_TAP_TARGET, Radius } from '@/shared/theme/twd';

/**
 * The sign-in button, and the first half of the sign-in transition.
 *
 * ⚠️ NOT `TwdButton`, and not a variant of it. TwdButton's busy state is an
 * `ActivityIndicator` — a rotating spinner, which is the one in-flight signal
 * this flow may not use — and it is on ~30 call sites that have no business
 * inheriting a login animation. This is the login button; everything else keeps
 * the shared one.
 *
 * THE BUTTON IS THE ANCHOR OBJECT. It does not vanish and get replaced by a
 * spinner or a modal. The label leaves, the body collapses toward a compact
 * form, and a single mark breathes inside it for exactly as long as the request
 * takes. On success it publishes its rect and `LoginTransition` continues the
 * same shape from the same place — see that file for why the continuation cannot
 * live here.
 *
 * IN-FLIGHT HAS NO DURATION. The loop is indefinite and symmetric, so a 5s
 * response looks the same as a 500ms one: still working, not stuck, and never
 * "finishing" early on a request that has not finished.
 *
 * THE SHAPE IS CONSTANT. Nothing here animates width, height or borderRadius —
 * see the note on the mark style for the two shape-changing designs that were
 * tried first and why both were withdrawn.
 */

/** Dimmed state of an inactive dot. Matches the reference: visible, not hidden. */
const DOT_REST = 0.32;
/** One beat. Three beats to a lap, so the emphasis visits each dot once. */
const STEP = 260;

const ENTER = Easing.bezier(0.22, 1, 0.36, 1);
const EXIT = Easing.bezier(0.64, 0, 0.78, 0);

export type SubmitPhase = 'idle' | 'submitting';

export function LoginSubmitButton({
  label,
  busyLabel,
  phase,
  onPress,
  disabled = false,
  reduceMotion = false,
}: {
  label: string;
  busyLabel: string;
  phase: SubmitPhase;
  onPress: () => void;
  disabled?: boolean;
  reduceMotion?: boolean;
}) {
  const theme = useTwdTheme();
  const box = useRef<View>(null);

  const busy = phase === 'submitting';

  // 0 = idle (full width, label showing), 1 = in-flight (collapsed, mark showing)
  const collapse = useSharedValue(0);
  /** Label fade, run ahead of the collapse so nothing is squashed mid-fade. */
  const labelOut = useSharedValue(0);
  /**
   * One shared value per dot, so the emphasis can TRAVEL across them.
   *
   * Three dots driven by a single value would all move together, which reads as a
   * throb rather than as progress. Separate values offset by `STAGGER` give the
   * travelling wave in the reference: one dot lit, the next taking over.
   */
  const d0 = useSharedValue(DOT_REST);
  const d1 = useSharedValue(DOT_REST);
  const d2 = useSharedValue(DOT_REST);

  useEffect(() => {
    if (reduceMotion) {
      // No motion at all: the label swaps and the body stays put. The flow still
      // works end to end, which is the requirement — motion is not the message.
      collapse.value = 0;
      labelOut.value = busy ? 1 : 0;
      d0.value = DOT_REST;
      d1.value = DOT_REST;
      d2.value = DOT_REST;
      return;
    }
    if (busy) {
      labelOut.value = withTiming(1, { duration: 160, easing: EXIT });
      collapse.value = withDelay(120, withTiming(1, { duration: 300, easing: ENTER }));
      /**
       * The travelling wave. Each dot rises, falls, then rests for the two beats
       * its neighbours are using — so one cycle is 3 × STEP and the emphasis lands
       * on each dot exactly once per lap.
       *
       * `withDelay` offsets each dot by one beat. `-1` repeats forever and the
       * loop is indefinite by construction: nothing here knows or cares how long
       * the request takes, which is the requirement — a 5s response looks the same
       * as a 500ms one.
       */
      const wave = (v: typeof d0, beat: number) => {
        v.value = withDelay(
          beat * STEP,
          withRepeat(
            withSequence(
              withTiming(1, { duration: STEP, easing: ENTER }),
              withTiming(DOT_REST, { duration: STEP, easing: EXIT }),
              withTiming(DOT_REST, { duration: STEP })
            ),
            -1,
            false
          )
        );
      };
      wave(d0, 0);
      wave(d1, 1);
      wave(d2, 2);
      return;
    }
    // Back to idle. Restrained, and no shake: an error is explained in words next
    // to the field, not performed at the user.
    for (const v of [d0, d1, d2]) {
      cancelAnimation(v);
      v.value = withTiming(DOT_REST, { duration: 200, easing: EXIT });
    }
    collapse.value = withTiming(0, { duration: 320, easing: ENTER });
    labelOut.value = withDelay(140, withTiming(0, { duration: 220, easing: ENTER }));
  }, [busy, reduceMotion, collapse, labelOut, d0, d1, d2]);

  useEffect(
    () => () => {
      cancelAnimation(collapse);
      cancelAnimation(labelOut);
      cancelAnimation(d0);
      cancelAnimation(d1);
      cancelAnimation(d2);
    },
    [collapse, labelOut, d0, d1, d2]
  );


  /**
   * ⚠️ THE BUTTON NO LONGER CHANGES SHAPE AT ALL, AND THAT IS THE FIX.
   *
   * It used to collapse to a circle with `scaleX` down to its height/width ratio
   * (~48/342 ≈ 0.14). Two things broke, and only one of them was fixable that way:
   *
   *   1. `scaleX` scales EVERY child. The round 10px mark rendered as a 1.4px
   *      vertical sliver and the label smeared on its way out. A counter-scaled
   *      wrapper fixed that.
   *   2. `scaleX` also scales the CORNER RADIUS. A pill's capsule ends became
   *      ellipses (rx 24 → 3.4, ry 24) so the collapsed shape had bowed sides and
   *      flattened ends. Nothing inside the transform can undo that — the radius
   *      is geometry, not a child.
   *
   * A second attempt — cross-fading the pill out and a real circle in — traded
   * those artifacts for worse ones: centring the chip needed `alignItems` on the
   * pressable, which shrink-wrapped the pill to its label and rendered a circle
   * with "Sign in" spilling over it.
   *
   * So the shape is now CONSTANT. The label leaves, a mark scales and breathes in
   * its place, the pill never moves. That is less than the brief's "collapses
   * toward a compact form", and it is deliberate: two attempts at a shape change
   * both produced visible geometry bugs on a real device, and a button that is
   * merely restrained beats one that is subtly deformed every time someone signs
   * in. Transform and opacity only, one element animating, nothing to distort.
   */
  /**
   * The label leaves BEFORE the squash begins, rather than during it.
   *
   * Counter-scaling text that is mid-fade still reads as stretching, because the
   * eye tracks the glyph edges. Sequencing it out first means there is nothing
   * left to distort by the time the body moves — `labelOut` is driven separately
   * from `collapse` for exactly that reason.
   */
  const labelStyle = useAnimatedStyle(() => ({
    opacity: 1 - labelOut.value,
    transform: [{ translateY: 6 * labelOut.value }],
  }));

  /**
   * The dots carry OPACITY ONLY; the row carries the one transform.
   *
   * Three dots each scaling would be three transformed elements at once, past the
   * two the brief allows — and it would not match the reference anyway, where the
   * dots are all the same size and differ only in weight. So the group scales in
   * once as the label leaves (opacity paired with a transform, as required) and
   * the emphasis inside it is pure opacity.
   */
  const rowStyle = useAnimatedStyle(() => ({
    opacity: collapse.value,
    transform: [{ scale: 0.94 + 0.06 * collapse.value }],
  }));
  const dot0 = useAnimatedStyle(() => ({ opacity: d0.value }));
  const dot1 = useAnimatedStyle(() => ({ opacity: d1.value }));
  const dot2 = useAnimatedStyle(() => ({ opacity: d2.value }));

  return (
    <Pressable
      ref={box}
      onLayout={() => {
        box.current?.measureInWindow((x, y, w, h) => {
          // Published while the button is still on screen, because after success
          // it will not be. See login-transition.tsx.
          if (w > 0) registerSubmitAnchor(x, y, w, h);
        });
      }}
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={busy ? busyLabel : label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      style={styles.hit}>
      <View style={[styles.body, { backgroundColor: theme.primary }]} collapsable={false}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.centre, labelStyle]}>
          <ThemedText type="defaultBold" style={{ color: theme.onPrimary }} numberOfLines={1}>
            {label}
          </ThemedText>
        </Animated.View>
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.centre, styles.row, rowStyle]}
          pointerEvents="none"
          accessibilityElementsHidden>
          <Animated.View style={[styles.dot, { backgroundColor: theme.onPrimary }, dot0]} />
          <Animated.View style={[styles.dot, { backgroundColor: theme.onPrimary }, dot1]} />
          <Animated.View style={[styles.dot, { backgroundColor: theme.onPrimary }, dot2]} />
        </Animated.View>
      </View>
    </Pressable>
  );
}

/** Announce a result to a screen reader. Motion is not the message. */
export function announce(message: string) {
  AccessibilityInfo.announceForAccessibility(message);
}

const styles = StyleSheet.create({
  hit: { minHeight: MIN_TAP_TARGET, justifyContent: 'center' },
  centre: { alignItems: 'center', justifyContent: 'center' },
  body: {
    minHeight: MIN_TAP_TARGET,
    borderRadius: Radius.pill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  row: { flexDirection: 'row', gap: 8 },
  dot: { width: 9, height: 9, borderRadius: 4.5 },
});
