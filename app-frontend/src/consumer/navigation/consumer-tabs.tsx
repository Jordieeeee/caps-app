import { NativeTabs } from 'expo-router/unstable-native-tabs';

import AppTabs from '@/shared/components/app-tabs';

/**
 * Consumer tab bar. Four tabs, each answering one consumer question.
 *
 * This previously declared SIX triggers — Home, Alert, Billing, Account,
 * Payments, Feedback — and iOS renders five. UITabBarController silently folds
 * everything past the fifth into a system-generated "More" list, which is why
 * Payments and Feedback appeared to have been "buried in More": nobody put them
 * there, the platform did, in trigger order. Same defect the collector bar had.
 *
 * What each tab is for, against how often a consumer actually does it:
 *
 *   Home     — every open. What do I owe, when is it due, anything urgent?
 *   Bills    — monthly, plus any time a charge is questioned.
 *   Notices  — episodic but time-critical: an interruption tomorrow is useless
 *              news the day after.
 *   Account  — rare. Link once (cap 5), then profile, feedback, sign out.
 *
 * Billing and Payments merged into Bills. They were two views of one thing — past
 * bills and upcoming bills — and that split is the billing department's org chart,
 * not a consumer's mental model. Someone thinking "my water bill" should not have
 * to guess which tab holds it. Payments also had no payment in it: the backend has
 * no payment route, and its "Pay Now" button had no onPress. It was a reminders
 * feed named after a capability that does not exist, and Home now carries the
 * reminder where it is actually seen.
 *
 * Feedback folded into Account rather than earning a tab of its own — it is the
 * least-used screen in the module and was occupying a slot that the platform then
 * ate anyway.
 *
 * Five is the ceiling. A sixth trigger hands the More tab back to UIKit.
 *
 * Icons are `sf` + `md`: SF Symbols on iOS, Material on Android, both shipped with
 * the OS. The old bar used PNGs from the Expo starter template.
 */
export default function ConsumerTabs() {
  return (
    <AppTabs>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md="home" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="bills">
        <NativeTabs.Trigger.Label>Bills</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'doc.text', selected: 'doc.text.fill' }}
          md="receipt_long"
        />
      </NativeTabs.Trigger>

      {/* "Notices", not "Alert" (the old tab) or "Announcements" (the old screen
          title — the two never agreed). "Alert" over-promises: most of this feed
          is routine service news, and a tab that cries alert about extended office
          hours teaches people to ignore it on the day a main breaks. The badge
          system carries urgency now, so the tab does not have to.
          "Announcements" is honest but 13 characters and truncates in a tab bar.
          "Notices" fits, covers interruptions/advisories/updates alike, and is the
          register a government utility already posts under. */}
      <NativeTabs.Trigger name="notices">
        <NativeTabs.Trigger.Label>Notices</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'bell', selected: 'bell.fill' }} md="notifications" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="account">
        <NativeTabs.Trigger.Label>Account</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'person.circle', selected: 'person.circle.fill' }}
          md="account_circle"
        />
      </NativeTabs.Trigger>
    </AppTabs>
  );
}
