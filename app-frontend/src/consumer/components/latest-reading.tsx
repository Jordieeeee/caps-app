import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import type { Account } from '@/consumer/services/consumer-data';
import { Icon } from '@/shared/components/icon';
import { ScreenSection } from '@/shared/components/screen-container';
import { formatBillingPeriod, formatDate } from '@/shared/format/date';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { Radius, Spacing } from '@/shared/theme/twd';

/**
 * "Your meter was read on the 4th" — the answer neither Home nor Bills could give.
 *
 * ⚠️ EVERY OTHER FIGURE ON BOTH SCREENS IS AS OLD AS THE LAST BILLING RUN. A
 * collector reads a meter, the reading reaches TWD within minutes, and until the
 * district's run at the end of the period the household had no way to see that it
 * had happened: both screens showed last month's bill and last month's cubic
 * metres, unchanged, for weeks after somebody stood at their meter. This card is
 * the only thing on either screen that moves on the day of the visit.
 *
 * ONE COMPONENT, TWO SCREENS, deliberately — the same rule
 * consumer/components/water-usage.tsx follows and for the same reason: Home and
 * Bills disagreeing about a number the consumer just read on the other one is the
 * class of bug this codebase keeps closing. A reading is exactly as true on Bills
 * as on Home, and it must not be phrased differently there.
 *
 * NO PESO FIGURE, EVER. What the reading costs depends on the rate schedule in
 * force, arrears carried forward and the district's own discounts — all decided in
 * the Admin Portal when the bill is issued. A number here would be a guess the bill
 * then contradicts, and it is the guess the consumer would remember. Cubic metres
 * are a fact about their meter; pesos are TWD's to state.
 *
 * Renders nothing at all when no account has an unbilled reading. Silence is
 * correct: the server cannot tell a meter nobody has visited from one whose reading
 * is already on a bill, so a placeholder would have to invent which.
 */
export function LatestReadingCards({ accounts }: { accounts: Account[] }) {
  const theme = useTwdTheme();
  const withReadings = accounts.filter((a) => a.latestReading);
  if (withReadings.length === 0) return null;

  return (
    <ScreenSection gap={Spacing.two}>
      {withReadings.map((account) => (
        <LatestReadingCard
          key={account.id}
          account={account}
          // Named only when there is more than one property to confuse. The
          // decision is made against the accounts PASSED IN, so a screen filtered
          // to one property stops repeating that property's number at the reader.
          showAccount={accounts.length > 1}
          theme={theme}
        />
      ))}
    </ScreenSection>
  );
}

function LatestReadingCard({
  account,
  showAccount,
  theme,
}: {
  account: Account;
  showAccount: boolean;
  theme: ReturnType<typeof useTwdTheme>;
}) {
  const reading = account.latestReading;
  if (!reading) return null;

  return (
    <View
      style={[
        styles.card,
        { borderColor: theme.border, backgroundColor: theme.backgroundElement },
      ]}
      accessibilityRole="summary"
      accessibilityLabel={`Meter read ${formatDate(reading.readingDate)}${
        reading.consumption !== null
          ? `, ${reading.consumption} cubic metres since your ${
              reading.billedThrough ? `${formatBillingPeriod(reading.billedThrough)} bill` : 'last bill'
            }`
          : ''
      }. Not yet billed.`}>
      <View style={styles.top}>
        <Icon name="droplet" size={16} color={theme.primary} />
        <ThemedText type="smallBold">Meter read {formatDate(reading.readingDate)}</ThemedText>
      </View>

      {/* The consumption, not the meter face — the cubic metres are the figure a
          household can act on and the odometer number on the dial is not. The
          reading itself is the smaller line because it is what they can check
          against the box outside.

          "SINCE YOUR AUGUST 2026 BILL", never "since then". The old wording sat
          directly under the reading date and so pointed at it, and the reading date
          is the one date on this card the figure is NOT measured from — water used
          "since" a reading taken this morning would be nearly none, while the number
          beside it is a month of it. Naming the bill also lets the household check
          the claim: the bill is in their hand, its closing reading is printed on it,
          and this figure is the meter now minus that. */}
      {reading.consumption !== null ? (
        <ThemedText type="defaultBold">
          {/* No bill to name means the baseline was an opening reading, and this
              household has never been billed. "Since your last bill" would name one
              that does not exist, so that case states the quantity and its status
              and claims nothing about where it is measured from. */}
          {reading.billedThrough
            ? `${reading.consumption} m³ since your ${formatBillingPeriod(reading.billedThrough)} bill`
            : `${reading.consumption} m³ not yet billed`}
        </ThemedText>
      ) : (
        <ThemedText type="defaultBold">Reading recorded</ThemedText>
      )}

      <ThemedText type="small" themeColor="textSecondary">
        {showAccount ? `${account.accountNumber} · ` : ''}
        Meter now reads {reading.currentReading}
      </ThemedText>

      {/**
       * The sentence that keeps this from reading as a bill.
       *
       * `pending` is the ordinary state of a reading waiting for the month to close
       * and is deliberately not dressed as a warning — the household has done
       * nothing wrong and owes nothing yet. Neither wording promises an amount or a
       * date, because this app does not know either until the portal issues the
       * bill.
       */}
      <ThemedText type="small" themeColor="textSecondary">
        {reading.state === 'approved'
          ? `Confirmed by TWD. Your ${formatBillingPeriod(reading.period)} bill will be calculated from this reading.`
          : `Not yet billed. Your ${formatBillingPeriod(reading.period)} bill will follow once TWD has checked it.`}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  /* One border width, not the summary card's two: this is information, not the
     thing either screen is about, and it must not compete with the amount above
     it. */
  card: {
    padding: Spacing.four,
    borderRadius: Radius.card,
    borderWidth: 1,
    gap: Spacing.two,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
});
