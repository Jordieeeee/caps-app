import { useUnreadNoticeCount } from '@/consumer/services/notice-unread';
import AppTabs, { type AppTabDef } from '@/shared/components/app-tabs';

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
  const unreadNotices = useUnreadNoticeCount();

  const tabs: AppTabDef[] = [
    { name: 'index', label: 'Home', sf: { default: 'house', selected: 'house.fill' }, md: 'home', icon: 'home' },

    /* A wallet, not a document. `doc.text` described the artefact — a bill is a
       piece of paper — while the tab is opened to answer "what do I owe and have
       I paid it?", which is a question about money. It also stops colliding with
       the collector bar's Reports tab, which legitimately is a document.

       `wallet.pass` rather than `wallet.bifold`: bifold is iOS 17+ and this
       project's deployment target is 16.4 (ios/Podfile), where it would render as
       a blank tab. */
    {
      name: 'bills',
      label: 'Bills',
      sf: { default: 'wallet.pass', selected: 'wallet.pass.fill' },
      md: 'account_balance_wallet',
      icon: 'wallet',
    },

    /* The badge is the only one in either bar. It is here rather than on the
       Notices screen because a number that can only be seen by opening the screen
       it describes has nothing left to tell you once you can see it — the whole
       job is to be visible from Home on the morning the office posts an
       interruption. Rendered only when there is something to say: a badge showing
       0 is a red dot claiming attention for nothing. See notice-unread.ts for what
       "unread" means, and for what this deliberately is NOT — nothing here reaches
       a phone whose owner has not opened the app. */
    {
      name: 'notices',
      label: 'Notices',
      sf: { default: 'bell', selected: 'bell.fill' },
      md: 'notifications',
      icon: 'bell',
      badge: unreadNotices,
    },

    {
      name: 'account',
      label: 'Account',
      sf: { default: 'person.circle', selected: 'person.circle.fill' },
      md: 'account_circle',
      icon: 'user',
    },
  ];

  return <AppTabs tabs={tabs} />;
}
