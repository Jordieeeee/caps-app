import { NativeTabs } from 'expo-router/unstable-native-tabs';

import AppTabs from '@/shared/components/app-tabs';

/**
 * Collector tab bar.
 *
 * These triggers previously sat commented out at the bottom of app-tabs.tsx — the
 * role split is what makes them reachable, since they can now mount without the
 * consumer tabs alongside them.
 *
 * Six tabs is at the practical limit for a bottom bar; if Reports and Sync grow,
 * fold them behind a single "More" tab rather than adding a seventh.
 */
export default function CollectorTabs() {
  return (
    <AppTabs>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/homeIcon.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="reading-reports">
        <NativeTabs.Trigger.Label>Readings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/collector.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="daily-collections">
        <NativeTabs.Trigger.Label>Collections</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/billing.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="service-reports">
        <NativeTabs.Trigger.Label>Reports</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/home.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="reconnections">
        <NativeTabs.Trigger.Label>Reconnect</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/alert.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="sync-status">
        <NativeTabs.Trigger.Label>Sync</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/explore.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>
    </AppTabs>
  );
}
