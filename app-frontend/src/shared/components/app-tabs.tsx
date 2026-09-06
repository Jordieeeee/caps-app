import { NativeTabs } from 'expo-router/unstable-native-tabs';
import type { ReactNode } from 'react';

import { Colors } from '@/constants/theme';
import { useResolvedScheme } from '@/shared/theme/theme-preference';
import { twdTheme } from '@/shared/theme/twd';

/**
 * The shared tab bar chrome. Relocated here from src/components/app-tabs.tsx.
 *
 * Only the *chrome* is shared — the triggers are not. The original component
 * hardcoded the six Consumer tabs with the Collector tabs commented out beneath
 * them, which made it role-mixed: moving it into shared/ verbatim would have put
 * consumer-specific navigation into shared/, exactly the leak the structure is
 * meant to prevent. Splitting on children keeps the styling in one place while
 * each role owns its own tab list:
 *
 *   src/collector/navigation/collector-tabs.tsx
 *   src/consumer/navigation/consumer-tabs.tsx
 *
 * Extend this rather than reaching for NativeTabs directly, so both roles stay
 * visually identical.
 */
export default function AppTabs({ children }: { children: ReactNode }) {
  // Through the preference, not the OS: the bar is the one piece of chrome on
  // every screen, and a tab bar that stayed light while the screens above it went
  // dark would read as a rendering bug rather than as a setting.
  const scheme = useResolvedScheme();
  const colors = Colors[scheme];
  const twd = twdTheme(scheme);

  return (
    <NativeTabs
      backgroundColor={colors.background}
      /**
       * ⚠️ ANDROID LABELS ONLY THE SELECTED TAB UNLESS TOLD OTHERWISE.
       *
       * Material's default is `selected`, so three of the four tabs showed a bare
       * glyph and the bar had to be decoded rather than read — the difference a
       * screenshot of the two platforms side by side makes obvious, where iOS
       * names every tab and Android named one. "Notices" and "Account" are not
       * self-evident as a bell and a person to someone who did not install this
       * app themselves, which is most of the district.
       *
       * iOS ignores this prop and labels everything already.
       */
      labelVisibilityMode="labeled"
      /**
       * The selected tab carries the brand colour on both platforms.
       *
       * Android's default is to tint the selected icon with the Material primary
       * and leave the label near-black, which read as "one icon is a slightly
       * different grey" on a light bar. Selection has to survive a sunlit screen
       * at arm's length, so it is carried by colour AND weight, and the resting
       * state steps down to the secondary text colour so there is somewhere to
       * step up FROM.
       */
      iconColor={{ default: colors.textSecondary, selected: twd.primary }}
      rippleColor={twd.primarySubtle}
      indicatorColor={twd.primarySubtle}
      /**
       * Badge colours are stated rather than left to the platform.
       *
       * iOS paints a system red and Android its own error colour, so an
       * unstyled badge is two different reds on two phones sitting next to each
       * other — and neither is the red this app uses for everything else it
       * marks as needing attention. `danger` is that red (see theme/twd.ts,
       * where it is checked for contrast), and the white on top of it is the
       * one pairing on the badge that has to stay legible at 10pt.
       *
       * `badgeTextColor` is Android and web only; iOS draws white on the badge
       * background and offers no say in it, which is the same result.
       */
      badgeBackgroundColor={twd.danger}
      badgeTextColor="#FFFFFF"
      labelStyle={{
        default: { color: colors.textSecondary },
        selected: { color: twd.primary, fontWeight: '600' },
      }}>
      {children}
    </NativeTabs>
  );
}
