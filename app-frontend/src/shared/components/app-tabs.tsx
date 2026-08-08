import { NativeTabs } from 'expo-router/unstable-native-tabs';
import type { ReactNode } from 'react';

import { Colors } from '@/constants/theme';
import { useResolvedScheme } from '@/shared/theme/theme-preference';

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
  const colors = Colors[useResolvedScheme()];

  return (
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.backgroundElement}
      labelStyle={{ selected: { color: colors.text } }}>
      {children}
    </NativeTabs>
  );
}
