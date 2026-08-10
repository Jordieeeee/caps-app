import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Icon, type IconName } from '@/shared/components/icon';
import { ScreenContainer, ScreenSection } from '@/shared/components/screen-container';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { Radius, Spacing } from '@/shared/theme/twd';

/**
 * How to pay a TWD bill.
 *
 * This screen exists instead of a Pay button, and the distinction is not a
 * shortcut — it is the truth about this system. There is no payment route in the
 * backend: `Billing.paymentDate`/`paymentMethod` are written by the Admin Portal
 * when the office records money received, and nothing anywhere accepts a
 * consumer-initiated payment. (This used to read "or by a collector syncing cash
 * taken in the field" — that path was removed with `POST /collections`; see
 * app-backend/routes/index.js.) The old Payments screen had a "Pay Now" button with
 * no `onPress` at all — it had never done anything.
 *
 * A tab called Payments and a green Pay Now button tell a consumer the water
 * district takes payment through this app. It does not. That is not a UI polish
 * problem; it is the app making a promise the utility has to absorb at the counter
 * when someone arrives believing they already paid.
 *
 * So the app says what is actually true: here is what you owe, and here is where
 * money is accepted. When a gateway and a POST /payments route exist, this screen
 * is where the Pay action lands, and the channels below stay — paying over the
 * counter does not stop being real when an online option appears.
 *
 * ⚠️ "Your field collector" WAS A CHANNEL HERE AND WAS WRONG. It told consumers that
 * collectors accept cash on their route and print an official receipt on the spot.
 * TWD's collectors read meters and do not take payment — the collector module says
 * so in six places, and `printCollectionReceipt` was deleted from
 * collector/services/printer-service.ts for the same reason: it printed an "Official
 * Payment Receipt" against a payment nothing in this system can record. This screen
 * was the last place still making that promise, and it made it to the person holding
 * the cash. Someone who follows it hands money to a meter reader who has no way to
 * record it, and arrives at the counter still owing the bill.
 *
 * ⚠️ The details below are placeholders in the shape of real ones. Office hours,
 * the address, and the partner list must be confirmed with TWD before release —
 * a wrong office address on a government app sends someone across town.
 */

interface Channel {
  icon: IconName;
  title: string;
  body: string;
  detail?: string;
  /**
   * Named outlets under a channel, grouped by how you reach them.
   *
   * A list rather than prose because this is scanning material: someone opens this
   * screen already holding a phone with two of these apps installed, looking for
   * whichever one they have. A sentence naming fourteen brands is a paragraph to
   * read; a wrapped set of names is a thing to spot your own in.
   */
  groups?: { label: string; names: string[] }[];
}

/**
 * Partner outlets, transcribed from TWD's own payment flyer.
 *
 * ⚠️ TWO KNOWN GAPS IN THE SOURCE, both carried here rather than smoothed over:
 *
 *   1. `BDO Pay` — the logo is partially cut off in the scan of the flyer. It is
 *      almost certainly BDO Pay, and it is listed because leaving out a channel a
 *      consumer can actually use costs them a trip too. CONFIRM WITH TWD BEFORE
 *      RELEASE; if it is wrong, someone opens an app that will not take the bill.
 *   2. One logo is blacked out in the scan and could not be read at all. So this
 *      list is known to be incomplete, and the card says so — a consumer whose
 *      usual outlet is missing must not conclude TWD does not accept it.
 *
 * Neither is a formatting problem. A government app's payment list is the kind of
 * thing people act on without checking, so what is uncertain about it belongs on
 * the screen, not only in this comment.
 */
const E_WALLETS = [
  'GCash',
  'BDO Pay',
  'SeaBank',
  'Coins.ph',
  'BPI',
  'ShopeePay',
];

const OVER_THE_COUNTER = [
  '7-Eleven',
  'M Lhuillier',
  'Palawan Pawnshop',
  'SM Bills Pay',
  'ecPay',
  'TrueMoney',
  'Cebuana Lhuillier',
  'Growsari',
];

const CHANNELS: Channel[] = [
  {
    icon: 'building',
    title: 'TWD main office',
    body: 'Pay over the counter with cash. Bring your bill or quote your account number.',
    detail: 'Monday to Friday, 8:00 AM – 5:00 PM',
  },
  {
    icon: 'credit-card',
    title: 'Banks and partner outlets',
    body: 'Accredited apps and payment centres accept TWD bills. Quote your account number, and keep the receipt or reference number until the payment shows as Paid here.',
    groups: [
      { label: 'E-wallets and banking apps', names: E_WALLETS },
      { label: 'Over the counter', names: OVER_THE_COUNTER },
    ],
  },
];

export default function HowToPayScreen() {
  const theme = useTwdTheme();

  return (
    <ScreenContainer variant="stack">
      <ScreenSection gap={Spacing.three}>
        <View
          style={[styles.note, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}
          accessible
          accessibilityRole="summary">
          <Icon name="info" size={20} color={theme.primary} />
          <ThemedText type="small" style={styles.noteText}>
            Payments aren&apos;t accepted in this app yet. Use one of the channels below — your
            bill updates here once TWD records the payment.
          </ThemedText>
        </View>

        {CHANNELS.map((channel) => (
          <ThemedView key={channel.title} type="backgroundElement" style={styles.card}>
            <View style={styles.cardHeader}>
              <Icon name={channel.icon} size={22} color={theme.primary} />
              <ThemedText type="defaultBold" style={styles.cardTitle}>
                {channel.title}
              </ThemedText>
            </View>
            <ThemedText type="small" themeColor="textSecondary" style={styles.body}>
              {channel.body}
            </ThemedText>
            {channel.detail && (
              <View style={styles.detailRow}>
                <Icon name="calendar" size={16} color={theme.textSecondary} />
                <ThemedText type="smallBold" themeColor="textSecondary">
                  {channel.detail}
                </ThemedText>
              </View>
            )}

            {channel.groups?.map((group) => (
              <View key={group.label} style={styles.group}>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  {group.label}
                </ThemedText>
                {/* One accessible node per group, not per name. A screen reader
                    stepping through fourteen separate one-word chips is a worse way
                    to hear "where can I pay" than one list read straight through. */}
                <View
                  style={styles.chips}
                  accessible
                  accessibilityRole="list"
                  accessibilityLabel={`${group.label}: ${group.names.join(', ')}`}>
                  {group.names.map((name) => (
                    <View
                      key={name}
                      style={[styles.chip, { borderColor: theme.border }]}
                      importantForAccessibility="no-hide-descendants">
                      <ThemedText type="small">{name}</ThemedText>
                    </View>
                  ))}
                </View>
              </View>
            ))}

            {/* The flyer this was transcribed from has one logo blacked out in the
                scan, so the list above is known to be incomplete. Saying so is the
                difference between a consumer asking at the counter and one
                concluding their usual outlet is not accepted. */}
            {channel.groups && (
              <ThemedText type="small" themeColor="textSecondary" style={styles.body}>
                This list may not be complete. If the outlet you use isn&apos;t shown, ask
                at the TWD office before paying elsewhere.
              </ThemedText>
            )}
          </ThemedView>
        ))}

        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="defaultBold">Before you pay</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.body}>
            • Pay at least three days before the due date — payments take time to record.
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.body}>
            • Keep your receipt until this app shows the bill as Paid.
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.body}>
            • If you can&apos;t pay in full, contact the office — arrangements are possible before
            disconnection.
          </ThemedText>
        </ThemedView>
      </ScreenSection>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.card,
    borderWidth: 2,
  },
  noteText: { flex: 1 },
  card: {
    padding: Spacing.four,
    borderRadius: Radius.card,
    gap: Spacing.two,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  cardTitle: { fontSize: 16, flex: 1 },
  body: { lineHeight: 20 },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  group: { gap: Spacing.two },
  /**
   * Wraps rather than scrolls sideways.
   *
   * `flexWrap` is what keeps fourteen names inside the card on a narrow phone —
   * without it the row reports its full unwrapped width as the card's intrinsic
   * width and pushes the whole page past the viewport, the same defect documented on
   * `detailValue` in consumer/account/index.tsx.
   */
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
});
