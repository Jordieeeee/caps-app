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

      {/* "Route", not "Readings": the tab holds the accounts still to be walked,
          not a log of the ones already done.

          A map, not the gauge it used to carry. The gauge described the *instrument*
          — and so did `md="speed"`, a speedometer, which on Android read as trip
          data rather than as a place to go. The screen behind this tab is a list of
          addresses grouped by barangay, in walk order; a map is what a person
          picturing "where am I going next" already has in their head. */}
      <NativeTabs.Trigger name="reading-reports">
        <NativeTabs.Trigger.Label>Route</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'map', selected: 'map.fill' }} md="map" />
      </NativeTabs.Trigger>

      {/* "Summary", not "Collections", and a folder rather than a banknote.
          Both words were wrong in the same direction: TWD's collectors read meters
          and never take payment — a consumer pays at the office — so a tab named
          for cash described a job nobody does, over a screen that has only ever
          listed meter readings. The folder is the day's filed records: what was
          read, and what has reached TWD. */}
      <NativeTabs.Trigger name="daily-summary">
        <NativeTabs.Trigger.Label>Summary</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'folder', selected: 'folder.fill' }} md="folder" />
      </NativeTabs.Trigger>

      {/* A document with a rising column chart — the platform twin of the Lucide
          `file-chart-column-increasing` this screen uses in its own empty states.
          `doc.text`/`description` drew a page of prose, which is what every other
          document icon in the app already means (a bill, a service notice); this
          tab holds figures for a month.

          No `.fill` variant is declared: `chart.bar.doc.horizontal.fill` is not
          reliably present across the SF Symbols versions shipped with the iOS
          releases this app supports (deployment target 16.4), and a selected tab
          with a missing symbol renders as a blank space. One symbol for both
          states is the safe form — same as the More tab's `ellipsis`. */}
      <NativeTabs.Trigger name="service-reports">
        <NativeTabs.Trigger.Label>Reports</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="chart.bar.doc.horizontal" md="assessment" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="more">
        <NativeTabs.Trigger.Label>More</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="ellipsis" md="more_horiz" />
      </NativeTabs.Trigger>
    </AppTabs>
  );
}
