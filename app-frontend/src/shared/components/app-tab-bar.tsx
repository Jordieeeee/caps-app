import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FLOATING_BAR_HEIGHT, FLOATING_BAR_MARGIN } from '@/constants/theme';

import { ThemedText } from '@/components/themed-text';
import { Icon, type IconName } from '@/shared/components/icon';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { Radius, Spacing } from '@/shared/theme/twd';

/**
 * What the bar needs to know about a tab, independent of who draws it.
 *
 * Keyed by route `name` rather than by position, because the navigator owns the
 * order and this bar must not hold a second opinion about it.
 */
export interface AppTabItem {
  name: string;
  label: string;
  icon: IconName;
  /** Rendered as a count when > 0. Only Notices uses it. */
  badge?: number;
}

/** Above this a badge stops being a count and becomes "a lot". */
const BADGE_CAP = 9;

/**
 * ⚠️ THE SELECTED TAB IS MARKED FOUR WAYS, AND THAT IS NOT REDUNDANT.
 *
 * Colour, stroke weight, label weight, and a filled indicator behind the glyph.
 * This bar is read at arm's length, outdoors, in Batangas sun, by someone holding
 * a meter key in the other hand — and colour alone fails all of: direct glare, a
 * cheap panel with a blue cast, and colour-blind users. Any one of the four
 * surviving is enough to answer "which tab am I on?".
 *
 * The indicator is Material 3's size (64x32) rather than something tighter,
 * because it doubles as the visual tap target: a 46dp pill under a 22dp icon
 * reads as decoration, while a 64dp one reads as the thing you pressed.
 *
 * Stroke weight is the substitute for an outline/filled icon pair. SF Symbols and
 * Material ship both weights; this set is stroked and has only one, so thickening
 * the line is the same signal by the only means available. 2.4 reads as emphasis;
 * 3 reads as a different icon.
 */
const INDICATOR_WIDTH = 64;
const INDICATOR_HEIGHT = 32;
const ICON_STROKE_IDLE = 2;
const ICON_STROKE_ACTIVE = 2.4;

/**
 * ⚠️ PRESS FEEDBACK IS DRAWN HERE, NOT LEFT TO `android_ripple`. TWO FAILED FIRST.
 *
 * `borderless: false` masks the ripple to the pressed view's bounds, and that view
 * is the whole tab column — `flex: 1`, full bar height, no background of its own to
 * give the mask a shape. Android fell back to the raw rectangle and drew a grey BOX
 * up the entire column, square corners fighting the bar's rounded ones.
 *
 * `borderless: true` with a radius fixed the box but can only ever be a CIRCLE:
 * radius scales an Android ripple, it cannot elongate one. Under a 64x32 indicator
 * a circle is the wrong shape twice over — too tall for the slot, and nothing like
 * the shape the press is about to produce.
 *
 * So the highlight is a view we control, sized to the indicator and sharing its
 * corner radius, and the press previews exactly the shape selection will leave
 * behind. The tap target is unaffected: the Pressable is still the full column, and
 * only the drawing is confined to the slot.
 *
 * The radius is deliberately short of a stadium (which at 32dp tall would be 16) so
 * the shape reads as a horizontal oval with corners, not as a pill.
 */
const SLOT_RADIUS = 13;

/**
 * One tab. A component rather than an inline map, because it owns animation state
 * and hooks cannot be called in a loop.
 */
function TabBarItem({
  tab,
  focused,
  reduceMotion,
  onPress,
}: {
  tab: AppTabItem;
  focused: boolean;
  reduceMotion: boolean;
  onPress: () => void;
}) {
  const theme = useTwdTheme();

  /**
   * ⚠️ `useDerivedValue`, NOT A `useSharedValue` WRITTEN FROM `useEffect`.
   *
   * The effect version left the indicator stuck ON under the tab that was focused
   * at launch: navigate away and Home kept its pill while its icon and label
   * correctly went grey. That split is the whole diagnosis — colour and weight are
   * plain props and re-rendered fine, so React was updating; only the value being
   * animated failed to reach the UI thread, because the effect wrote to the shared
   * value before that item's animated style had attached, and nothing wrote to it
   * again until the tab was selected a second time.
   *
   * A derived value has no such window. It re-evaluates on the UI thread whenever
   * `focused` changes and returns the animation itself, so there is no ordering
   * between "the style is listening" and "the value moved".
   *
   * A spring on selection, and nothing anywhere else in this bar. This codebase
   * reserves motion for one meaning — "the app is working on it" — which is why
   * the offline banner is deliberately motionless (see session-status-banner.tsx).
   * This does not break that rule: it is not claiming progress, it is acknowledging
   * a press the collector just made, and it is over in under 200ms.
   * Direct-manipulation feedback and a progress hint are different claims, and only
   * the second one can lie.
   *
   * Reduce Motion collapses it to a short cross-fade rather than removing the
   * transition outright: with no change at all the indicator teleports between
   * tabs, which is the jump the setting exists to prevent.
   */
  const pressed = useSharedValue(0);
  const pressStyle = useAnimatedStyle(() => ({ opacity: pressed.value * 0.6 }));

  const progress = useDerivedValue(
    () =>
      reduceMotion
        ? withTiming(focused ? 1 : 0, { duration: 120 })
        : withSpring(focused ? 1 : 0, { damping: 18, stiffness: 220, mass: 0.6 }),
    [focused, reduceMotion]
  );

  const indicatorStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    // Grows out from under the glyph rather than fading in place, so it reads as
    // having arrived where the finger landed.
    transform: [{ scaleX: 0.55 + progress.value * 0.45 }],
  }));

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={
        tab.badge && tab.badge > 0 ? `${tab.label}, ${tab.badge} unread` : tab.label
      }
      onPressIn={() => {
        pressed.value = withTiming(1, { duration: 60 });
      }}
      onPressOut={() => {
        pressed.value = withTiming(0, { duration: 160 });
      }}
      onPress={onPress}
      style={styles.item}>
      <View style={styles.iconSlot}>
        {/* A sibling behind the glyph, not a wrapper around it, so the indicator
            can scale without dragging the icon's size along with it. */}
        <Animated.View
          pointerEvents="none"
          style={[styles.indicator, { backgroundColor: theme.primarySubtle }, indicatorStyle]}
        />
        {/* Above the indicator so a press still registers on the selected tab,
            and fainter than it so the two never read as the same state. */}
        <Animated.View
          pointerEvents="none"
          style={[styles.indicator, { backgroundColor: theme.primarySubtle }, pressStyle]}
        />
        <Icon
          name={tab.icon}
          size={22}
          color={focused ? theme.primary : theme.textSecondary}
          strokeWidth={focused ? ICON_STROKE_ACTIVE : ICON_STROKE_IDLE}
        />
        {tab.badge !== undefined && tab.badge > 0 && (
          /* The red count, and the only badge in either bar. Sits on the icon
             rather than the label so it survives a long word. */
          <View style={[styles.badge, { backgroundColor: theme.danger }]}>
            <ThemedText style={styles.badgeText}>
              {tab.badge > BADGE_CAP ? `${BADGE_CAP}+` : String(tab.badge)}
            </ThemedText>
          </View>
        )}
      </View>
      <ThemedText
        numberOfLines={1}
        style={[
          styles.label,
          {
            color: focused ? theme.primary : theme.textSecondary,
            fontWeight: focused ? '700' : '500',
          },
        ]}>
        {tab.label}
      </ThemedText>
    </Pressable>
  );
}

/**
 * The Android tab bar.
 *
 * ⚠️ ANDROID ONLY, AND THAT IS THE POINT. iOS keeps `NativeTabs` — UIKit renders
 * the floating Liquid Glass bar itself on iOS 26, and hand-drawing a second one
 * would be a worse copy of something the platform already does properly. Android's
 * `BottomNavigationView` has no equivalent and exposes no geometry (no margin, no
 * corner radius, no height) through expo-router's props, so the only way to give
 * Android the same shape is to draw it.
 *
 * What is deliberately kept from the native bar, because a field tool is not the
 * place to be clever:
 *
 *  - Every tab is labelled, always. Material's default labels only the selected
 *    tab, and a bell with no word under it is not self-evident to a household
 *    reading a bill or a collector who did not install this app themselves.
 *  - The icons are the same shapes as the Material set they replace (see the
 *    tab-bar glyphs in icon.tsx). A collector's muscle memory should survive this.
 *  - Selection is carried by colour AND weight AND a filled pill, never colour
 *    alone — this is read at arm's length in direct sun.
 *  - Tap targets stay full-height and full-width per tab; the pill is decoration
 *    inside the target, not the target itself.
 *
 * The bar floats: inset from three edges, fully rounded, with a shadow rather
 * than a hairline. That costs about 20dp of content height over a docked bar,
 * which is why `BottomTabInset` in constants/theme.ts is derived from the two
 * exports above rather than guessed — change the height here and the padding
 * every screen reserves follows.
 */
export function AppTabBar({
  state,
  navigation,
  tabs,
}: BottomTabBarProps & { tabs: AppTabItem[] }) {
  const theme = useTwdTheme();
  const insets = useSafeAreaInsets();

  // Read once and then watched: a collector who turns the setting on mid-round
  // should not have to relaunch the app to be taken at their word.
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setReduceMotion(enabled);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      active = false;
      sub.remove();
    };
  }, []);

  return (
    <View
      // Pinned as a real native view. The bar's children swap styles on every tab
      // change, and a layout-only wrapper that Fabric flattens mid-swap is what
      // crashed the print flow — see active-glass-surface.tsx.
      collapsable={false}
      style={[
        styles.wrap,
        {
          paddingBottom: insets.bottom + FLOATING_BAR_MARGIN,
          /**
           * A fade, not a hard edge.
           *
           * The bar floats, so the list keeps scrolling underneath it and rows
           * were visible in the strip BELOW the bar as well as above — which reads
           * as content escaping off the bottom of the screen rather than passing
           * behind a control. The gradient lands the scroll softly into the
           * background instead, and stops short of a solid block, which would just
           * be a docked bar with extra steps.
           *
           * `experimental_backgroundImage` rather than expo-linear-gradient: the
           * gradient is one line of CSS, the package is a native dependency and a
           * rebuild, and this codebase already draws its splash gradient this way
           * (components/animated-icon.tsx).
           */
          experimental_backgroundImage: `linear-gradient(to bottom, transparent, ${theme.background} 55%)`,
        },
      ]}
      pointerEvents="box-none">
      <View
        collapsable={false}
        style={[
          styles.bar,
          {
            backgroundColor: theme.backgroundElement,
            borderColor: theme.border,
            shadowColor: '#000',
          },
        ]}>
        {state.routes.map((route, index) => {
          const tab = tabs.find((t) => t.name === route.name);
          if (!tab) return null;

          const focused = state.index === index;

          return (
            <TabBarItem
              key={route.key}
              tab={tab}
              focused={focused}
              reduceMotion={reduceMotion}
              onPress={() => {
                /**
                 * `navigate` by name, and only when not already focused.
                 *
                 * Re-navigating to the focused tab resets its stack, which throws
                 * away a half-typed meter reading if the collector taps the tab
                 * they are already on. The native bar does not do that, so neither
                 * does this one.
                 */
                if (focused) return;
                navigation.navigate(route.name);
              }}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: FLOATING_BAR_MARGIN,
    // Headroom for the gradient to fade in above the bar rather than starting
    // abruptly at its top edge.
    paddingTop: FLOATING_BAR_MARGIN * 2,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: FLOATING_BAR_HEIGHT,
    borderRadius: Radius.card + 8,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.one,
    // Android draws elevation; the shadow* props are what iOS would use if this
    // bar ever ran there, and cost nothing here.
    elevation: 8,
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    overflow: 'hidden',
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    gap: 3,
  },
  iconSlot: {
    width: INDICATOR_WIDTH,
    height: INDICATOR_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indicator: {
    // Written out rather than spread from StyleSheet.absoluteFill: this RN's
    // types expose `absoluteFill` as a style id, not an object, so spreading it
    // silently yields {} and the indicator would size to nothing.
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: SLOT_RADIUS,
  },
  label: {
    fontSize: 11,
    lineHeight: 14,
  },
  badge: {
    position: 'absolute',
    top: 1,
    right: 12,
    minWidth: 15,
    height: 15,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '700',
  },
});
