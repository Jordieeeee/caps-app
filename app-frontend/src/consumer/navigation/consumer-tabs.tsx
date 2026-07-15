import { NativeTabs } from 'expo-router/unstable-native-tabs';

import AppTabs from '@/shared/components/app-tabs';

/**
 * Consumer tab bar. Carried over unchanged from the original app-tabs.tsx, which
 * had these triggers hardcoded; only the routes moved into the (consumer) group.
 */
export default function ConsumerTabs() {
  return (
    <AppTabs>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/homeIcon.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="announcements">
        <NativeTabs.Trigger.Label>Alert</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/alert.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="billing">
        <NativeTabs.Trigger.Label>Billing</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/billing.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="accounts">
        <NativeTabs.Trigger.Label>Account</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/account.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="payments">
        <NativeTabs.Trigger.Label>Payments</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/payment.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="feedback">
        <NativeTabs.Trigger.Label>Feedback</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/feedback.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>
    </AppTabs>
  );
}
