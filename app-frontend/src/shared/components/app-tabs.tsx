import { Tabs } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { Platform } from 'react-native';

import { Colors } from '@/constants/theme';
import { AppTabBar, type AppTabItem } from '@/shared/components/app-tab-bar';
import type { IconName } from '@/shared/components/icon';
import { useResolvedScheme } from '@/shared/theme/theme-preference';
import { twdTheme } from '@/shared/theme/twd';

/**
 * One tab, described once, for both bars.
 *
 * `sf`/`md` are the OS symbol names the native bar draws; `icon` is the glyph the
 * React bar draws. All three are stated per tab rather than derived, because the
 * three icon sets do not agree about names and a lookup table would silently pick
 * the wrong glyph the first time one of them renamed something.
 */
export interface AppTabDef {
  name: string;
  label: string;
  sf: string | { default: string; selected: string };
  md: string;
  icon: IconName;
  badge?: number;
}

/**
 * The shared tab bar chrome.
 *
 * ⚠️ TWO IMPLEMENTATIONS ON PURPOSE, SPLIT BY PLATFORM.
 *
 * iOS keeps `NativeTabs`. On iOS 26 UIKit renders the floating Liquid Glass bar
 * itself — the one in the screenshots — and it does it with materials no React
 * view can reproduce. Drawing our own there would replace something the platform
 * does properly with a worse imitation, and lose the system's own tab semantics
 * with it.
 *
 * Android draws its own. `BottomNavigationView` is docked to the bottom edge by
 * construction, and the props expo-router exposes for it are colours and label
 * visibility — there is nothing for margin, corner radius, or height (checked
 * against expo-router's own types, not assumed). So the only way to give Android
 * the same shape as iOS is a React bar; see app-tab-bar.tsx for what it keeps
 * from the native one and why.
 *
 * The tab LIST stays shared. Only the chrome differs, so a tab added here appears
 * on both platforms and cannot drift between them:
 *
 *   src/collector/navigation/collector-tabs.tsx
 *   src/consumer/navigation/consumer-tabs.tsx
 *
 * Five is still the ceiling. It is a UIKit limit — a sixth trigger hands the More
 * tab back to a system-generated table — and the Android bar keeps the same cap so
 * the two platforms cannot disagree about what exists.
 */
export default function AppTabs({ tabs }: { tabs: AppTabDef[] }) {
  // Through the preference, not the OS: the bar is the one piece of chrome on
  // every screen, and a tab bar that stayed light while the screens above it went
  // dark would read as a rendering bug rather than as a setting.
  const scheme = useResolvedScheme();
  const colors = Colors[scheme];
  const twd = twdTheme(scheme);

  if (Platform.OS === 'android') {
    const items: AppTabItem[] = tabs.map((t) => ({
      name: t.name,
      label: t.label,
      icon: t.icon,
      badge: t.badge,
    }));

    return (
      <Tabs
        // The React bar is drawn over the content, so the navigator must not also
        // reserve space for a bar of its own underneath it.
        tabBar={(props) => <AppTabBar {...props} tabs={items} />}
        screenOptions={{ headerShown: false, tabBarStyle: { position: 'absolute' } }}>
        {tabs.map((t) => (
          <Tabs.Screen key={t.name} name={t.name} options={{ title: t.label }} />
        ))}
      </Tabs>
    );
  }

  return (
    <NativeTabs
      backgroundColor={colors.background}
      labelVisibilityMode="labeled"
      iconColor={{ default: colors.textSecondary, selected: twd.primary }}
      rippleColor={twd.primarySubtle}
      indicatorColor={twd.primarySubtle}
      /**
       * Badge colours are stated rather than left to the platform.
       *
       * iOS paints a system red and Android its own error colour, so an unstyled
       * badge is two different reds on two phones sitting next to each other — and
       * neither is the red this app uses for everything else it marks as needing
       * attention. `danger` is that red (see theme/twd.ts, where it is checked for
       * contrast), and the white on top of it is the one pairing on the badge that
       * has to stay legible at 10pt.
       */
      badgeBackgroundColor={twd.danger}
      badgeTextColor="#FFFFFF"
      labelStyle={{
        default: { color: colors.textSecondary },
        selected: { color: twd.primary, fontWeight: '600' },
      }}>
      {tabs.map((t) => (
        <NativeTabs.Trigger key={t.name} name={t.name}>
          <NativeTabs.Trigger.Label>{t.label}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={t.sf as never} md={t.md as never} />
          {t.badge !== undefined && t.badge > 0 && (
            <NativeTabs.Trigger.Badge>
              {t.badge > 9 ? '9+' : String(t.badge)}
            </NativeTabs.Trigger.Badge>
          )}
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}
