import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { changeLabel, formatCuM, type RecentUsage } from '@/consumer/lib/usage-summary';
import { Icon } from '@/shared/components/icon';
import { formatBillingPeriod } from '@/shared/format/date';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { Radius, Spacing } from '@/shared/theme/twd';

/**
 * How much water this household has been using — one module, two densities.
 *
 * Home gets `WaterUsageSummary` (the headline and a sparkline, tappable through to
 * Bills); Bills gets `WaterUsageCard` (the months named, with their figures). They
 * share this file rather than being written twice because the two screens
 * disagreeing about a number the consumer just read on the other one is the whole
 * class of bug this codebase keeps closing.
 *
 * Both are pure presentation over `recentUsage()`. Neither fetches, and neither
 * decides what "past 3 months" means — see consumer/lib/usage-summary.ts.
 *
 * ⚠️ NO COMPARISON THE DATA CANNOT SUPPORT. There is no "you use 20% more than
 * similar households" here, and there must not be: TWD publishes no such baseline,
 * and a bar drawn against an invented one tells a family they are wasteful on the
 * app's authority. The only comparisons on screen are this household's own months
 * against each other.
 */

/** Charted against the tallest month in the window, so the bars compare to each other. */
function barWidth(cubicMetres: number, peak: number): `${number}%` {
  // Never 0% — a month with real usage in it has to stay visible next to a much
  // bigger one, or a light month reads as no month at all.
  const pct = peak > 0 ? (cubicMetres / peak) * 100 : 0;
  return `${Math.max(6, Math.min(100, pct))}%`;
}

/**
 * A screen reader gets the numbers as a sentence, not as a row of bar graphics.
 *
 * The bars are decorative: every figure they encode is also printed beside them,
 * which is the same reason status is never carried by colour alone in this app.
 */
function usageAccessibilityLabel(usage: RecentUsage): string {
  const months = usage.months
    .map((m) => `${formatBillingPeriod(m.billingPeriod)}, ${formatCuM(m.cubicMetres)}`)
    .join('. ');
  const change = changeLabel(usage.change);
  return `${usage.label}: ${formatCuM(usage.totalCuM)}. ${months}.${change ? ` Latest month ${change}.` : ''}`;
}

/**
 * Bills — the full breakdown, month by month.
 *
 * Bars sit under a shared left gutter so all three start on one baseline: ragged
 * starts turn a comparison into three unrelated numbers. One colour for every bar,
 * because these are the same measurement over time, not three categories; the
 * newest month is marked by weight and a dot rather than by hue.
 */
export function WaterUsageCard({ usage }: { usage: RecentUsage }) {
  const theme = useTwdTheme();
  const change = changeLabel(usage.change);

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
      ]}
      accessible
      accessibilityLabel={usageAccessibilityLabel(usage)}>
      <View style={styles.header}>
        <View style={styles.headerLabel}>
          <Icon name="droplet" size={18} color={theme.primary} />
          <ThemedText type="defaultBold">{usage.label}</ThemedText>
        </View>
        <ThemedText style={[styles.total, { color: theme.primary }]} numberOfLines={1}>
          {formatCuM(usage.totalCuM)}
        </ThemedText>
      </View>

      <ThemedText type="small" themeColor="textSecondary">
        {usage.months.length > 1
          ? `Averaging ${formatCuM(usage.averageCuM)} a month`
          : 'One billed month on record'}
      </ThemedText>

      <View style={styles.rows}>
        {usage.months.map((month, index) => {
          const isLatest = index === usage.months.length - 1;
          return (
            <View key={month.billingPeriod} style={styles.row}>
              <ThemedText
                type={isLatest ? 'smallBold' : 'small'}
                themeColor={isLatest ? 'text' : 'textSecondary'}
                style={styles.rowMonth}
                numberOfLines={1}>
                {formatBillingPeriod(month.billingPeriod)}
              </ThemedText>
              <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
                <View
                  style={[
                    styles.bar,
                    {
                      backgroundColor: theme.primary,
                      opacity: isLatest ? 1 : 0.55,
                      width: barWidth(month.cubicMetres, usage.peakCuM),
                    },
                  ]}
                />
              </View>
              <ThemedText
                type={isLatest ? 'smallBold' : 'small'}
                style={styles.rowValue}
                numberOfLines={1}>
                {formatCuM(month.cubicMetres)}
              </ThemedText>
            </View>
          );
        })}
      </View>

      {change && <ChangeRow change={usage.change} label={change} />}

      {/* A window with a hole in it says so, rather than quietly summing fewer
          months than the heading counts. */}
      {usage.missing > 0 && (
        <ThemedText type="small" themeColor="textSecondary">
          {usage.missing === 1
            ? 'One recent bill carries no meter reading, so it is not counted here.'
            : `${usage.missing} recent bills carry no meter reading, so they are not counted here.`}
        </ThemedText>
      )}
    </View>
  );
}

/**
 * Home — the same story at a glance, and a way into the detail.
 *
 * Deliberately below the money. A consumer opens this app to find out what they
 * owe; usage is the second question, and it does not get to push the first one off
 * the fold. Tapping goes to Bills, where every figure here is broken out per bill.
 */
export function WaterUsageSummary({ usage }: { usage: RecentUsage }) {
  const theme = useTwdTheme();
  const router = useRouter();
  const change = changeLabel(usage.change);

  return (
    <Pressable
      onPress={() => router.push('/consumer/bills')}
      accessibilityRole="button"
      accessibilityLabel={usageAccessibilityLabel(usage)}
      accessibilityHint="Opens your bills, where each month's usage is listed"
      style={({ pressed }) => [
        styles.card,
        {
          borderColor: theme.border,
          backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
        },
      ]}>
      <View style={styles.header}>
        <View style={styles.headerLabel}>
          <Icon name="droplet" size={18} color={theme.primary} />
          <ThemedText type="small" themeColor="textSecondary">
            {usage.label}
          </ThemedText>
        </View>
        <Icon name="chevron-right" size={20} color={theme.textSecondary} />
      </View>

      <ThemedText
        style={[styles.headline, { color: theme.primary }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}>
        {formatCuM(usage.totalCuM)}
      </ThemedText>

      {/* Sparkline: columns, because three months read left-to-right as time. The
          month initials sit under them so the shape is never the only label. */}
      <View style={styles.spark} accessibilityElementsHidden importantForAccessibility="no">
        {usage.months.map((month, index) => (
          <View key={month.billingPeriod} style={styles.sparkColumn}>
            <View style={styles.sparkTrack}>
              <View
                style={[
                  styles.sparkBar,
                  {
                    backgroundColor: theme.primary,
                    opacity: index === usage.months.length - 1 ? 1 : 0.45,
                    height: barWidth(month.cubicMetres, usage.peakCuM),
                  },
                ]}
              />
            </View>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {shortMonth(month.billingPeriod)}
            </ThemedText>
          </View>
        ))}
      </View>

      {/* Just the change — the sparkline's last column already says which month is
          being talked about, and "July 2026: 12 m³ less than June 2026" spends two
          years' worth of words on one comparison. */}
      {change ? (
        <ChangeRow change={usage.change} label={change} />
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          {formatBillingPeriod(usage.latest.billingPeriod)} · {formatCuM(usage.latest.cubicMetres)}
        </ThemedText>
      )}
    </Pressable>
  );
}

/**
 * The month-on-month change, with an arrow that is never the only signal.
 *
 * Tone is intentionally neutral — `textSecondary`, not green for down and red for
 * up. Using less water is not automatically good news (a stuck meter looks exactly
 * like a careful month), and colouring it as praise or alarm makes the app take a
 * position on something it cannot see.
 */
function ChangeRow({
  change,
  label,
}: {
  change: RecentUsage['change'];
  label: string;
}) {
  const theme = useTwdTheme();
  if (!change) return null;

  return (
    <View style={styles.changeRow}>
      <Icon
        name={change.delta === 0 ? 'info' : change.delta > 0 ? 'trending-up' : 'trending-down'}
        size={14}
        color={theme.textSecondary}
      />
      <ThemedText type="small" themeColor="textSecondary" style={styles.changeText}>
        {label}
      </ThemedText>
    </View>
  );
}

/** `2026-07` → `Jul`. Column labels only; every other place spells the month out. */
function shortMonth(period: string): string {
  const full = formatBillingPeriod(period);
  return full.slice(0, 3);
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.card,
    borderWidth: 2,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  headerLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flex: 1,
  },
  total: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
  },
  // Its own lineHeight, like every other large figure in this app: inheriting a
  // display line-height onto a smaller glyph is what overlapped the collector's
  // currency tiles.
  headline: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '700',
  },
  rows: { gap: Spacing.two, marginTop: Spacing.one },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  // Fixed gutters both sides so every bar starts and ends on one baseline.
  rowMonth: { width: 84 },
  rowValue: { width: 62, textAlign: 'right' },
  track: {
    flex: 1,
    height: 10,
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  bar: { height: '100%', borderRadius: Radius.pill },
  spark: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
    height: 56,
  },
  sparkColumn: { flex: 1, gap: Spacing.one, alignItems: 'center' },
  sparkTrack: {
    width: '100%',
    height: 34,
    justifyContent: 'flex-end',
  },
  sparkBar: {
    width: '100%',
    borderTopLeftRadius: Radius.field,
    borderTopRightRadius: Radius.field,
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  changeText: { flex: 1 },
});
