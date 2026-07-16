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
 * backend: `Billing.paymentDate`/`paymentMethod` are written either by an Admin
 * creating the bill or by a collector syncing cash taken in the field, and nothing
 * anywhere accepts a consumer-initiated payment. The old Payments screen had a
 * "Pay Now" button with no `onPress` at all — it had never done anything.
 *
 * A tab called Payments and a green Pay Now button tell a consumer the water
 * district takes payment through this app. It does not. That is not a UI polish
 * problem; it is the app making a promise the utility has to absorb at the counter
 * when someone arrives believing they already paid.
 *
 * So the app says what is actually true: here is what you owe, and here is where
 * money is accepted. When a gateway and a POST /payments route exist, this screen
 * is where the Pay action lands, and the channels below stay — over-the-counter
 * and field collection do not stop being real when an online option appears.
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
}

const CHANNELS: Channel[] = [
  {
    icon: 'building',
    title: 'TWD main office',
    body: 'Pay over the counter with cash. Bring your bill or quote your account number.',
    detail: 'Monday to Friday, 8:00 AM – 5:00 PM',
  },
  {
    icon: 'banknote',
    title: 'Your field collector',
    body: 'Collectors accept cash on their route and print an official receipt on the spot. Always ask for the printed receipt.',
  },
  {
    icon: 'credit-card',
    title: 'Bank and partner outlets',
    body: 'Accredited banks and payment centres accept TWD bills. Keep the validated slip until the payment shows as Paid here.',
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
});
