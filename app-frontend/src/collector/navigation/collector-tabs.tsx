import { NativeTabs } from 'expo-router/unstable-native-tabs';

import AppTabs from '@/shared/components/app-tabs';

/**
 * Collector tab bar. Five tabs — and five is a ceiling, not a preference.
 *
 * This previously declared six. iOS does not render six: UITabBarController
 * silently collapses everything past the fifth into a system-generated "More" tab
 * backed by a plain UITableView. That list is not stylable, not themable, and not
 * something anyone designed — Reconnect and Sync were being served to collectors
 * as an unbranded grey table. The sixth tab did not add a destination; it removed
 * two.
 *
 * So More is now ours: a real route we control, holding the low-frequency work
 * (sync detail, service orders, session). Adding a sixth trigger here hands the
 * More tab back to UIKit — don't.
 *
 * Icons are `sf` + `md`: SF Symbols on iOS, Material on Android. Both ship with
 * the OS, so distinct per-tab glyphs cost no assets and no dependency, and each
 * platform gets the icon its users already recognise. The bar previously pointed
 * Readings and Reports at collector.png and home.png — byte-identical files
 * (md5 eeb5de2ac12a…), so two different tabs rendered the same glyph — while Home
 * used a third copy of a house. All six were Expo starter-template leftovers.
 *
 * Note this is the *native* bar: it renders platform images, not React views, so
 * the react-native-svg set in shared/components/icon.tsx cannot be used here. That
 * set is for icons inside screen content, where RN does the drawing.
 */
export default function CollectorTabs() {
  return (
    <AppTabs>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md="home" />
      </NativeTabs.Trigger>

      {/* A dial. Meter readers recognise a gauge; they do not recognise a house. */}
      <NativeTabs.Trigger name="reading-reports">
        <NativeTabs.Trigger.Label>Readings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="gauge.with.dots.needle.bottom.50percent" md="speed" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="daily-collections">
        <NativeTabs.Trigger.Label>Collections</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="banknote" md="payments" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="service-reports">
        <NativeTabs.Trigger.Label>Reports</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'doc.text', selected: 'doc.text.fill' }} md="description" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="more">
        <NativeTabs.Trigger.Label>More</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="ellipsis" md="more_horiz" />
      </NativeTabs.Trigger>
    </AppTabs>
  );
}
