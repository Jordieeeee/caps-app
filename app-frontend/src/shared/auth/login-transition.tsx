/* eslint-disable react-hooks/immutability --
 * Same reason as shared/components/app-intro.tsx: this rule treats
 * `sharedValue.value = x` as mutating something React owns. For Reanimated that
 * assignment IS the API — a shared value is a UI-thread box, and writing it is
 * precisely how this animation avoids a re-render. The rule has no model of
 * worklets and flags every correct use.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  makeMutable,
  useAnimatedReaction,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useAuth } from '@/shared/auth/auth-context';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { Radius } from '@/shared/theme/twd';

/**
 * The half of the sign-in transition that has to outlive the login screen.
 *
 * ⚠️ WHY THIS IS NOT ON THE LOGIN SCREEN, WHICH IS WHERE IT VISIBLY BELONGS.
 * `adopt()` in auth-context sets `signedIn`, the `Stack.Protected` guard in
 * app/_layout.tsx flips, and the entire `(auth)` route — the form, the button,
 * everything — unmounts on that same commit. There is no frame in which the
 * button exists and the authenticated screen also exists, so a success animation
 * owned by the button cannot run: its component is already gone. Nothing about
 * that is a bug to fix; guard-driven routing is what makes swipe-back into the
 * login screen impossible, which is worth more than the convenience of keeping
 * the screen mounted.
 *
 * So the button hands off. It publishes its own rect while it is still on screen,
 * and this overlay — mounted at the root, above the navigator, surviving the
 * unmount — picks up exactly where it left off. Two objects, but co-located and
 * identically shaped, which is the same seam the splash→app handoff hides.
 *
 * ONLY ON A REAL SIGN-IN. It watches for `authenticating → signedIn`
 * specifically, never `restoring → signedIn`: a cold start that restores a
 * session from the keychain is not a sign-in and must not play this.
 */

/**
 * Where the submit button was, in window coordinates, and when the request
 * started.
 *
 * A shared value rather than a JS object because the reaction that reads it is a
 * worklet, and the Babel plugin freezes a captured plain object at creation time
 * — it would read the zeroes it was born with forever.
 */
const anchor = makeMutable({ x: 0, y: 0, w: 0, h: 0 });
/**
 * A plain mirror for LAYOUT.
 *
 * `width`/`height`/`left`/`top` are read once at render and never animated — the
 * performance floor bans animating them, and putting them inside
 * `useAnimatedStyle` would recompute them on the UI thread every frame for no
 * reason and invite someone to make them move later. The shared value above is
 * only for worklets; this is what the style uses.
 */
let anchorJS = { x: 0, y: 0, w: 0, h: 0 };

/** Wall-clock ms when the in-flight state became visible. JS-side only. */
let submitStartedAt = 0;

export function registerSubmitAnchor(x: number, y: number, w: number, h: number) {
  anchor.value = { x, y, w, h };
  anchorJS = { x, y, w, h };
}

export function markSubmitStart() {
  submitStartedAt = Date.now();
}

/**
 * THE ONE PERMITTED MINIMUM-DURATION GUARD, and the only timer in this file.
 *
 * A request that returns in 80ms would otherwise paint the in-flight state for a
 * single frame and rip it away again — a strobe, which reads as a glitch rather
 * than as speed. This holds the in-flight state to 250ms of visibility before the
 * success motion begins.
 *
 * It is NOT pacing the animation: the animation's own duration is unaffected, and
 * a request slower than 250ms waits exactly zero extra milliseconds. It exists to
 * stop a state being shown for less time than a person can perceive it.
 */
const MIN_INFLIGHT_MS = 250;

/**
 * Never wait longer than this for calm.
 *
 * Worst case the whole sequence is 140 (cover) + 350 (wait) + 300 (resolve) =
 * 790ms, inside the 900ms ceiling. The wait is not animation — the overlay is
 * opaque and still throughout it — so a heavy screen buys a longer hold rather
 * than a visible stutter.
 */
/**
 * Hard ceiling on the overlay's life.
 *
 * The animation completes in 720ms. If its callback never arrives — the app was
 * backgrounded mid-transition, a system alert stole the run loop, the JS thread
 * stalled — this tears the overlay down anyway. It is a safety net, not pacing:
 * on every normal run the animation finishes first and this is cleared unused.
 */
const SAFETY_MS = 1600;

/**
 * ⚠️ TWO TERMINAL STATES, NOT ONE, AND MISSING THE SECOND MADE THIS DEAD CODE FOR
 * REAL ACCOUNTS.
 *
 * `POST /auth/login` answers in two shapes. A password session returns tokens and
 * ends at `signedIn`; an account provisioned through the Admin Portal returns
 * `{sessionToken, role, email}`, which api-client routes to `kind: 'google'` and
 * auth-context adopts as `googleSignedIn` (see `adoptGoogleSession`). Both are a
 * successful sign-in through this very form. Watching only `signedIn` meant the
 * transition never played for portal accounts — which is most real users — and the
 * bug was invisible until it was run against a live one.
 *
 * Both paths persist before they dispatch (`secureTokenStore.save` /
 * `googleSessionStore.save`), so the success motion still cannot precede the
 * token being written on either.
 */
const SIGNED_IN = new Set(['signedIn', 'googleSignedIn']);

/** Entrances: fast out, long settle. */
const ENTER = Easing.bezier(0.22, 1, 0.36, 1);
/** Exits: slow to leave, then gone. */
const EXIT = Easing.bezier(0.64, 0, 0.78, 0);
/** Critically damped: damping 22 > 2·√(120·1) ≈ 21.9. No overshoot. */
const SPRING = { damping: 22, stiffness: 120, mass: 1, overshootClamping: true } as const;

export function LoginTransition() {
  // Imperative animation end to end; memoisation has nothing to offer it.
  'use no memo';

  const { state } = useAuth();
  const theme = useTwdTheme();
  const [playing, setPlaying] = useState(false);
  /**
   * Derived DURING RENDER, not in an effect.
   *
   * This is React's documented "adjusting state when a prop changes" pattern, and
   * it is the right shape here: whether to play is a pure function of the status
   * transition we just observed. Doing it in an effect meant rendering `null`,
   * then immediately setting state and rendering again — a wasted frame at the
   * exact moment the screen is handing over, and what
   * `react-hooks/set-state-in-effect` objects to.
   *
   * `authenticating → signedIn` only. `restoring → signedIn` is a cold start
   * restoring a keychain session, which is not a sign-in and must not animate.
   */
  const [seenStatus, setSeenStatus] = useState(state.status);
  if (state.status !== seenStatus) {
    const isSignIn = seenStatus === 'authenticating' && SIGNED_IN.has(state.status);
    setSeenStatus(state.status);
    if (isSignIn && anchorJS.w > 0) setPlaying(true);
  }

  const go = useSharedValue(false);
  const puck = useSharedValue(0); // 0 = button shape, 1 = resolved
  const ground = useSharedValue(0); // overlay opacity
  const reduceMotion = useSharedValue(false);

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

  /**
   * The trigger. `authenticating → signedIn` is a sign-in; anything else into
   * `signedIn` (a restore on cold start) is not, and must not animate.
   *
   * The anti-strobe hold is applied HERE, on the JS side, before the worklet is
   * armed — so the animation itself is never delayed once it starts.
   */
  /**
   * Arm the worklet once we are playing, after the anti-strobe hold.
   *
   * Writing a shared value is not React state, so nothing here re-renders — the
   * animation is armed on the UI thread and runs without this component doing
   * anything further.
   */
  useEffect(() => {
    if (!playing) return;
    const shown = Date.now() - submitStartedAt;
    const hold = Math.max(0, MIN_INFLIGHT_MS - shown);
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (hold === 0) go.value = true;
    else timers.push(setTimeout(() => { go.value = true; }, hold));
    // Belt and braces — see SAFETY_MS.
    timers.push(setTimeout(() => setPlaying(false), hold + SAFETY_MS));
    return () => timers.forEach(clearTimeout);
  }, [playing, go]);

  const frame = useFrameCallback((info) => {
    'worklet';
    if (!go.value) return;
    const dt = info.timeSincePreviousFrame ?? 0;
    if (dt <= 0) return;
    frames.value += 1;
    if (dt > worst.value) worst.value = dt;
    if (dt > 16.7) dropped.value += 1;
  }, false);

  useEffect(() => {
    if (!playing) {
      /**
       * Rearm for the next sign-in.
       *
       * `useAnimatedReaction` fires on a CHANGE, and its `was` guard means a value
       * left at `true` can never trigger again — so without this reset the second
       * sign-in of a session (sign out, sign back in) would play nothing at all.
       * Counters are cleared too, or the reported frame numbers would accumulate
       * across every login the app has ever done.
       */
      go.value = false;
      puck.value = 0;
      ground.value = 0;
      frames.value = 0;
      dropped.value = 0;
      worst.value = 0;
      return;
    }
    frame.setActive(true);
    return () => frame.setActive(false);
  }, [playing, frame, go, puck, ground, frames, dropped, worst]);

  useAnimatedReaction(
    () => go.value,
    (start, was) => {
      'worklet';
      if (!start || was) return;

      if (reduceMotion.value) {
        // No motion. The overlay is a cross-fade and nothing transforms.
        ground.value = withTiming(1, { duration: 160, easing: ENTER }, () => {
          'worklet';
          ground.value = withTiming(0, { duration: 200, easing: EXIT }, (done) => {
            'worklet';
            if (done) scheduleOnRN(setPlaying, false);
          });
        });
        return;
      }

      // The overlay's ground is already the login screen's own background token,
      // so it appears without a colour step. It fades in fast under the puck.
      /**
       * ⚠️ THE CALM GATE THAT USED TO BE HERE IS GONE, DELIBERATELY.
       *
       * Waiting for a sub-18ms frame before resolving fixed the app-open intro,
       * so it was tried here too. It cannot be used on this surface: the resolve
       * was driven from the frame callback, and when iOS put its "Save Password?"
       * alert over the app the callback stopped being called — no frames, no
       * accumulated wait, no resolve. The overlay sat opaque and white with no way
       * forward, which locks the user out of the app entirely.
       *
       * Dropped frames during a heavy mount are a blemish. A stuck full-screen
       * overlay is a broken app. The sequence below is time-driven end to end and
       * has no condition that can fail to become true; `SAFETY_MS` below is the
       * belt to this braces.
       */
      ground.value = withSequence(
        withTiming(1, { duration: 140, easing: ENTER }),
        withDelay(
          280,
          withTiming(0, { duration: 300, easing: EXIT }, (done) => {
            'worklet';
            if (done) {
              scheduleOnRN(report, frames.value, dropped.value, worst.value);
              scheduleOnRN(setPlaying, false);
            }
          })
        )
      );
      puck.value = withDelay(140, withSpring(1, SPRING));
    }
  );

  const groundStyle = useAnimatedStyle(() => ({ opacity: ground.value }));

  /**
   * The puck starts as the button's exact rect and resolves upward and outward
   * a little as it fades — a shape settling, not a badge arriving. Transform and
   * opacity only; the rounded corner is a static style, never animated.
   */
  const puckStyle = useAnimatedStyle(() => ({
    opacity: 1 - puck.value,
    transform: [{ translateY: -12 * puck.value }, { scale: 1 - 0.06 * puck.value }],
  }));
  // Static: position and size come from the measured rect, and the pill radius is
  // a constant. None of these animate.
  const puckBox = {
    width: anchorJS.w,
    height: anchorJS.h,
    left: anchorJS.x,
    top: anchorJS.y,
    borderRadius: Radius.pill,
  };

  if (!playing) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.ground, { backgroundColor: theme.background }, groundStyle]}>
      <Animated.View style={[styles.puck, puckBox, { backgroundColor: theme.primary }, puckStyle]} />
    </Animated.View>
  );
}

function report(total: number, drops: number, worstMs: number) {
  if (!__DEV__) return;
  console.log(`[login] frames ${total} · over-budget ${drops} · worst ${worstMs.toFixed(1)}ms`);
  // Same file-pull channel as the intro: a physical iOS device surfaces
  // console.log to neither Metro's stdout nor os_log.
  void (async () => {
    try {
      const FS = await import('expo-file-system/legacy');
      await FS.writeAsStringAsync(
        `${FS.documentDirectory}login-metrics.json`,
        JSON.stringify({ total, drops, worstMs, at: Date.now() })
      );
    } catch {
      // Measurement only.
    }
  })();
}

const styles = StyleSheet.create({
  ground: { ...StyleSheet.absoluteFill, zIndex: 900 },
  puck: { position: 'absolute' },
});
