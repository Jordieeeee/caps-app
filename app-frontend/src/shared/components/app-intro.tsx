/* eslint-disable react-hooks/immutability --
 * `react-hooks/immutability` treats `sharedValue.value = x` as mutating a value
 * React considers immutable. For Reanimated that assignment IS the API: a shared
 * value is a UI-thread box, not React state, and writing it is precisely how an
 * animation avoids a re-render. The rule does not model worklets and flags every
 * correct use, so it is off for this file rather than worked around — the whole
 * point of this component is that it mutates these boxes and never re-renders.
 * Nothing else here is exempt; the file is one component with no React state
 * beyond the single `done` flag that unmounts it.
 */
import { Image } from 'expo-image';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Dimensions, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedReaction,
  useAnimatedStyle,
  useFrameCallback,
  makeMutable,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useTwdTheme } from '@/shared/hooks/use-twd-theme';

/**
 * Native splash → animated intro → first real screen, as one continuous object.
 *
 * ⚠️ WHAT THIS REPLACES. `components/animated-icon.tsx` was Expo's starter
 * template, still mounted and still shipping: it drew `expo-logo.png` on
 * `#208AEF` — the Expo logo, on Expo blue — between TWD's splash and the app, with
 * `Easing.elastic` bounce and a glow rotating 7200°. Every cold start showed
 * another company's branding for ~600ms.
 *
 * THE HANDOFF IS THE WHOLE PROBLEM, and it is solved by geometry rather than by
 * timing. The first frame this paints is pixel-identical to the native splash —
 * same 200pt badge, same centre, same ground — because `twa-mark` and
 * `twa-wordmark` are a lossless split of the very asset the native splash renders
 * (a circular cut at r=0.796, the outer edge of the yellow ring; recompositing
 * them is bit-exact against `twa-app.png`). The native splash is hidden only after
 * this view has laid out, so there is no frame in which neither is on screen.
 *
 * WHY TWO LAYERS. The wordmark is illegible below ~48pt, so it cannot travel to a
 * header. It leaves first, and the mark — droplet and rings, which reads fine
 * small — is what continues. That beat is the reason the badge was split at all.
 *
 * THE MARK HAS SOMEWHERE TO GO ONLY WHEN SIGNED OUT. The login screen has a 96pt
 * badge in its header; `consumer/index` and `collector/index` deliberately do not,
 * so for a returning user there is no destination and inventing one would mean
 * adding a logo to screens designed without it. With no registered target the mark
 * settles in place instead (1.00 → 0.94) and fades. Both paths use the same
 * curves, the same budget, and the same two animated elements.
 *
 * NOTHING HERE IS PACED BY A TIMER. The exit is triggered by `ready` flipping —
 * real boot work resolving — via a shared value and `useAnimatedReaction`, so it
 * runs on the UI thread and cannot be delayed by a blocked JS thread. The only
 * clock is the stall deadline below, and it is measured on the UI thread by
 * `useFrameCallback`, not by `setTimeout`.
 */

/** Splash geometry, mirrored from app.json's `imageWidth: 200`, `resizeMode: contain`. */
const BADGE = 200;

/**
 * Portrait-locked (`orientation: 'portrait'`), so screen size is read once at
 * module scope. `useWindowDimensions` would subscribe this component to a resize
 * event and re-render it mid-sequence, which is the one thing the animation
 * budget cannot absorb.
 */
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

/**
 * Cold start only.
 *
 * Module scope, not state or a ref: it has to survive this component unmounting
 * itself at the end of the sequence, and it has to survive Fast Refresh. A ref is
 * recreated on remount and would replay the intro every time a file is saved in
 * dev; `AppState` resume never remounts the root, but this closes that door too.
 */
let hasPlayed = false;

/**
 * Where the mark is going, in window coordinates — written by the destination
 * screen, read by the worklet.
 *
 * ⚠️ A SHARED VALUE, NOT A PLAIN OBJECT. It was a module-level `{ current }` box
 * and that was silently broken: the Babel plugin serialises a worklet's captured
 * variables into the UI runtime at creation time, so the reaction read the `null`
 * it was born with and never saw a registration. `size: 0` is the unregistered
 * sentinel, because a shared value cannot be null-checked across the boundary as
 * cheaply as it can be compared.
 *
 * Not React state or context either, and for the original reason:
 * the login screen measures its badge in `onLayout`, which happens WHILE this
 * overlay is still fully opaque, and routing that through a setState would
 * re-render the tree during the hold. Nothing reads this on the React side, so
 * there is nothing to re-render.
 */
const introTarget = makeMutable({ x: 0, y: 0, size: 0 });

/**
 * Called by whichever screen owns the badge the mark flies to.
 *
 * `measureInWindow` rather than `onLayout`'s local rect: the login badge sits
 * inside a ScrollView inside a SafeAreaView, so its layout-relative position says
 * nothing about where it is on screen.
 */
export function registerIntroTarget(x: number, y: number, size: number) {
  introTarget.value = { x, y, size };
}

export function clearIntroTarget() {
  introTarget.value = { x: 0, y: 0, size: 0 };
}

/** Entrances: fast out, long settle. */
const ENTER = Easing.bezier(0.22, 1, 0.36, 1);
/** Exits: slow to leave, then gone. */
const EXIT = Easing.bezier(0.64, 0, 0.78, 0);

/**
 * Critically damped — `damping: 22` against `stiffness: 120` at `mass: 1` is above
 * the 2·√(k·m) ≈ 21.9 critical threshold, so the mark reaches its resting position
 * without crossing it. Overshoot on a circular badge reads as a toy, and this is
 * the most-watched moment in the sequence.
 */
const SPRING = { damping: 22, stiffness: 120, mass: 1, overshootClamping: true } as const;

/**
 * How long the last frame may hold when boot has not resolved.
 *
 * Past this the app is revealed regardless, which on a stalled network means the
 * session-restore loading screen. That is the correct failure: a frozen badge with
 * no way forward is worse than an honest "Restoring your session…".
 */
const STALL_MS = 2500;

/**
 * A frame at or under this means the UI thread has caught up after the first
 * screen's commit. Generous enough that a 60Hz device (16.7ms) qualifies on a
 * normal frame, tight enough to exclude the commit itself.
 */
const CALM_MS = 18;
/** Never wait longer than this for calm — some devices simply never get there. */
const ARM_CAP_MS = 220;

export function AppIntro({ ready }: { ready: boolean }) {
  /**
   * Opted out of the React Compiler (`experiments.reactCompiler` in app.json).
   *
   * Every value here is a Reanimated shared value written from a worklet, an
   * effect, or a layout callback — which the compiler's "do not modify a value
   * used in an effect" rule forbids outright. Memoisation has nothing to offer a
   * component that deliberately never re-renders during its own animation, so the
   * opt-out costs nothing and keeps the mutation model honest rather than
   * contorting it to satisfy an analysis that does not model worklets.
   */
  'use no memo';

  const theme = useTwdTheme();
  const [done, setDone] = useState(hasPlayed);

  // Shared values only. Not one of these crosses into React during the sequence.
  const readySV = useSharedValue(false);
  const wordmark = useSharedValue(1);
  const markScale = useSharedValue(1);
  const markX = useSharedValue(0);
  const markY = useSharedValue(0);
  const markOpacity = useSharedValue(1);
  const ground = useSharedValue(1);
  const elapsed = useSharedValue(0);
  /** Written only by the frame worklet; `readySV` only by the effect. */
  const stalled = useSharedValue(false);
  const exiting = useSharedValue(false);
  const sinceExit = useSharedValue(0);
  /** Boot resolved and the splash is down — but the UI thread may still be busy. */
  const armed = useSharedValue(false);
  const armWait = useSharedValue(0);
  /** The mark's branch is chosen a few frames into the exit — see the frame callback. */
  const markPending = useSharedValue(false);

  const reduceMotion = useSharedValue(false);
  const painted = useRef(false);
  /** UI-thread mirror of `painted`, so the reaction can gate on it. */
  const paintedSV = useSharedValue(false);

  // Frame instrumentation + the stall deadline, both on the UI thread. Frame
  // deltas are accumulated in shared values and reported once, after the
  // sequence — logging per frame would put a bridge hop inside the budget.
  const frames = useSharedValue(0);
  const dropped = useSharedValue(0);
  const worst = useSharedValue(0);

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      if (alive) reduceMotion.value = on;
    });
    return () => {
      alive = false;
    };
  }, [reduceMotion]);

  useEffect(() => {
    readySV.value = ready;
  }, [ready, readySV]);

  const frame = useFrameCallback((info) => {
    'worklet';
    const dt = info.timeSincePreviousFrame ?? 0;

    // ── Phase 1: holding ─────────────────────────────────────────────────────
    if (!armed.value) {
      elapsed.value += dt;
      if (elapsed.value >= STALL_MS) stalled.value = true;
      return;
    }

    // ── Phase 2: armed, waiting for the UI thread to come free ───────────────
    // The first screen's Fabric commit lands here. Starting inside it cost a
    // measured 55.05ms frame on an iPhone 14 Pro Max. Begin on the first frame
    // that arrives inside CALM_MS, or give up waiting at ARM_CAP_MS so a device
    // that never settles still gets its intro finished.
    if (!exiting.value) {
      armWait.value += dt;
      if (dt > 0 && dt > CALM_MS && armWait.value < ARM_CAP_MS) return;
      exiting.value = true;

      if (reduceMotion.value) {
        // Reports too, so the reduced path is observable rather than merely
        // silent — "no log line" and "never ran" looked identical while testing.
        ground.value = withTiming(0, { duration: 240, easing: EXIT }, (finished) => {
          'worklet';
          if (finished) {
            scheduleOnRN(report, frames.value, dropped.value, worst.value, false, true);
            scheduleOnRN(setDone, true);
          }
        });
        return;
      }

      // 1. The wordmark leaves first and alone.
      wordmark.value = withTiming(0, { duration: 260, easing: EXIT });
      // 2. The mark's destination is not knowable yet — the login screen is only
      //    now mounting. Resolved below, inside the design's own 60ms overlap.
      markPending.value = true;
      // 3. The ground goes last, uncovering populated content.
      ground.value = withDelay(
        100,
        withTiming(0, { duration: 260, easing: EXIT }, (finished) => {
          'worklet';
          if (finished) {
            scheduleOnRN(report, frames.value, dropped.value, worst.value, introTarget.value.size > 0);
            scheduleOnRN(setDone, true);
          }
        })
      );
      return;
    }

    // ── Phase 3: animating ───────────────────────────────────────────────────
    if (dt <= 0) return;
    sinceExit.value += dt;

    // Choose the mark's branch as soon as a destination exists, never before the
    // 60ms overlap and never later than 140ms — inside the wordmark's 260ms fade
    // either way. Past 140ms with nothing registered, the screen underneath has
    // no badge (consumer/collector home) and the mark settles in place instead.
    if (markPending.value && sinceExit.value >= 60) {
      const t = introTarget.value;
      if (t.size > 0) {
        markPending.value = false;
        markX.value = withSpring(t.x + t.size / 2 - SCREEN_W / 2, SPRING);
        markY.value = withSpring(t.y + t.size / 2 - SCREEN_H / 2, SPRING);
        markScale.value = withSpring(t.size / BADGE, SPRING);
      } else if (sinceExit.value >= 140) {
        markPending.value = false;
        markScale.value = withTiming(0.94, { duration: 300, easing: ENTER });
        markOpacity.value = withDelay(60, withTiming(0, { duration: 240, easing: EXIT }));
      }
    }

    frames.value += 1;
    if (dt > worst.value) worst.value = dt;
    // Counted against the 60Hz budget so the figure means the same thing on both
    // profiles. A 120Hz device runs ~8.3ms and only trips this on a real hitch,
    // which is exactly what we want the number to catch.
    if (dt > 16.7) dropped.value += 1;
  }, false);

  useAnimatedReaction(
    () => (readySV.value || stalled.value) && paintedSV.value,
    (isReady, was) => {
      'worklet';
      if (!isReady || was || armed.value) return;

      /**
       * ⚠️ ARMED, NOT STARTED — and the difference was worth 55ms on a real
       * iPhone 14 Pro Max.
       *
       * `ready` flips the instant session restore resolves, which is the exact
       * instant React commits the first screen's entire native view hierarchy.
       * Under Fabric that commit runs ON THE UI THREAD, so starting the exit here
       * put the most-watched moment of the sequence in a frame the UI thread was
       * already saturating: measured 1 over-budget frame at 55.05ms, about six
       * dropped frames at 120Hz.
       *
       * The animation is correctly on the UI thread; the UI thread was the
       * problem. So the frame callback starts it on the first frame that comes in
       * under `CALM_MS`, i.e. once the commit storm has passed. Not pacing — it
       * is waiting on a measured condition, and `ARM_CAP_MS` bounds it.
       */
      armed.value = true;
    }
  );

  useEffect(() => {
    if (done) return;
    frame.setActive(true);
    return () => {
      frame.setActive(false);
      cancelAnimation(markX);
      cancelAnimation(markY);
      cancelAnimation(markScale);
      cancelAnimation(ground);
    };
  }, [done, frame, markX, markY, markScale, ground]);

  const groundStyle = useAnimatedStyle(() => ({ opacity: ground.value }));
  const wordmarkStyle = useAnimatedStyle(() => ({ opacity: wordmark.value }));
  const markStyle = useAnimatedStyle(() => ({
    opacity: markOpacity.value,
    transform: [
      { translateX: markX.value },
      { translateY: markY.value },
      { scale: markScale.value },
    ],
  }));

  if (done) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.ground, { backgroundColor: theme.background }, groundStyle]}
      onLayout={() => {
        // The native splash is torn down only once this view has been laid out,
        // so the two are never both absent. Guarded because onLayout fires again
        // on any re-measure and hideAsync must not be called twice.
        if (painted.current) return;
        painted.current = true;
        paintedSV.value = true;
        hasPlayed = true;
        void SplashScreen.hideAsync().catch(() => {
          // Already hidden, or hidden by something else. Nothing to recover —
          // this view is opaque and covering the same pixels either way.
        });
      }}>
      <View style={styles.badge}>
        {/* Two <Image>s, one transform each. No SVG, so nothing here can tempt a
            future change into animating a path or a radius. */}
        <Animated.View style={[styles.layer, wordmarkStyle]}>
          <Image
            source={require('@/assets/images/twa-wordmark.png')}
            style={styles.layerImage}
            contentFit="contain"
            accessibilityIgnoresInvertColors
          />
        </Animated.View>
        <Animated.View style={[styles.layer, markStyle]}>
          <Image
            source={require('@/assets/images/twa-mark.png')}
            style={styles.layerImage}
            contentFit="contain"
            accessibilityIgnoresInvertColors
          />
        </Animated.View>
      </View>
    </Animated.View>
  );
}

/**
 * One line, once, after the sequence has finished.
 *
 * Dev only. These numbers are the whole point of the performance floor and they
 * are worthless if collecting them costs frames, so nothing is logged while the
 * animation is running.
 */
function report(total: number, drops: number, worstMs: number, travelled: boolean, reduced = false) {
  if (!__DEV__) return;
  // Also written to a file, because a PHYSICAL iOS device surfaces console.log to
  // neither Metro's stdout nor os_log — verified during this work, across
  // `devicectl device console`, `log stream --device-name`, and Metro itself. The
  // only way to read these numbers off a real phone is to pull them from the app
  // container:
  //
  //   xcrun devicectl device copy from --device <udid> \
  //     --domain-type appDataContainer --domain-identifier com.anonymous.app-frontend \
  //     --source Documents/intro-metrics.json --destination ./metrics.json
  //
  // __DEV__-gated, so it does not exist in a release bundle.
  void (async () => {
    try {
      const FS = await import('expo-file-system/legacy');
      await FS.writeAsStringAsync(
        `${FS.documentDirectory}intro-metrics.json`,
        JSON.stringify({ total, drops, worstMs, travelled, reduced, at: Date.now() })
      );
    } catch {
      // Measurement only; never let it affect the app.
    }
  })();
  console.log(
    `[intro] ${reduced ? 'reduced' : travelled ? 'travel' : 'settle'} · frames ${total} · over-budget ${drops} · worst ${worstMs.toFixed(1)}ms`
  );
}

const styles = StyleSheet.create({
  ground: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    // Last child of the root layout, so this is belt-and-braces rather than the
    // thing doing the work. See the note in app/_layout.tsx on why order matters.
    zIndex: 1000,
  },
  badge: { width: BADGE, height: BADGE },
  layer: { ...StyleSheet.absoluteFill },
  layerImage: { width: '100%', height: '100%' },
});
