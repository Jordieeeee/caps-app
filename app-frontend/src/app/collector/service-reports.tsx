import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { useTwdTheme } from "@/shared/hooks/use-twd-theme";
import {
  loadBillingPeriods,
  type PeriodInvoice,
} from "@/collector/services/billing-periods";
import { PrinterService } from "@/collector/services/printer-service";
import { formatPeso } from "@/shared/format/currency";
import { formatDate } from "@/shared/format/date";
import { FilterChips } from "@/shared/components/filter-chips";
import { ListEmpty, ListError } from "@/shared/components/list-states";
import { ScreenHeader } from "@/shared/components/screen-header";
import { SkeletonList } from "@/shared/components/skeleton";
import { SyncBadge } from "@/shared/components/status-badge";
import {
  ScreenContainer,
  ScreenSection,
} from "@/shared/components/screen-container";
import { PrintButton } from "@/shared/components/print-button";
import { useAsync } from "@/shared/hooks/use-async";
import { Radius } from "@/shared/theme/twd";

type SyncFilter = "sent" | "pending";

/**
 * Reports — what this collector billed, by calendar month.
 *
 * ⚠️ THIS SCREEN WAS ENTIRELY FICTIONAL until now. Three hard-coded periods
 * (July/June/May **2025**, unchanging whatever today's date was), three invented
 * households on WD-XXXXX account numbers that exist nowhere in TWD's data, and
 * aggregates to match: ₱202,500 across 450 invoices, none of it derived from
 * anything. It looked exactly like a working report, which is the problem — a demo
 * fixture is only harmless while everyone remembers it is one.
 *
 * The periods are now generated from the device clock, so the newest chip is always
 * the current month and year, and every figure beneath them is derived from the
 * readings this phone holds — see collector/services/billing-periods.ts for why the
 * outbox is the right and only source, and why paid/overdue cannot appear here.
 */
export default function ServiceReportsScreen() {
  const { state, reload, refresh, refreshing } = useAsync(
    useCallback(() => loadBillingPeriods(), []),
  );

  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [syncFilter, setSyncFilter] = useState<SyncFilter | null>(null);

  /**
   * Re-read on focus.
   *
   * Every reading recorded on the route tab lands in this month's period, so
   * walking back here after a meter must not show the figure from before it.
   * `refresh` rather than `reload`: reload blanks to a skeleton.
   */
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const periods = useMemo(
    () => (state.status === "ready" ? state.data : []),
    [state],
  );

  /**
   * The current month is the default, and stays the default across a re-read.
   *
   * `selectedPeriodId` is null until the collector picks one, rather than being
   * seeded with the first period once loaded: seeding needs an effect that fires
   * on every load, and on the 1st of a month that effect would silently move the
   * selection off the period someone was reading.
   */
  const period = useMemo(
    () => periods.find((p) => p.id === selectedPeriodId) ?? periods[0] ?? null,
    [periods, selectedPeriodId],
  );

  const sentCount = period ? period.totalInvoices - period.pendingSync : 0;

  const visibleInvoices = useMemo(() => {
    if (!period) return [];
    if (!syncFilter) return period.invoices;
    return period.invoices.filter((i) =>
      syncFilter === "sent" ? i.synced : !i.synced,
    );
  }, [period, syncFilter]);

  /**
   * The printed report describes the period on screen, and says where it came from.
   *
   * The "on this device" line is not boilerplate: this is generated from the
   * handset's own outbox, so while anything is pending it is a statement about this
   * phone and not about TWD's records. Same rule as the daily report — see
   * shared/utils/daily-report.ts.
   */
  const printReportJob = () => {
    if (!period) return Promise.resolve();

    return PrinterService.print({
      type: "report",
      title: `BILLING REPORT - ${period.name}`,
      content: [
        `Period: ${period.startDate} to ${period.endDate}`,
        `Invoices issued: ${period.totalInvoices}`,
        `Total billed: ${formatPeso(period.totalBilled)}`,
        "--------------------------------",
        `Sent to TWD: ${sentCount}`,
        `Pending sync: ${period.pendingSync}`,
        ...(period.pendingSync > 0
          ? ["", "NOTE: includes records that have not", "yet reached the TWD office."]
          : []),
      ],
      footer: "End of Billing Report",
    });
  };

  return (
    <ScreenContainer onRefresh={refresh} refreshing={refreshing}>
      <ScreenHeader
        title="Reports"
        subtitle={
          period
            ? `${period.name}${period.current ? " · in progress" : ""}`
            : "Billing by month"
        }
      />

      {state.status === "loading" && (
        <ScreenSection>
          <SkeletonList count={3} label="Loading your billing periods" />
        </ScreenSection>
      )}

      {state.status === "error" && (
        <ScreenSection>
          <ListError
            title="Could not build your report"
            body="The readings saved on this phone could not be read. They have not been lost — try again."
            onRetry={reload}
          />
        </ScreenSection>
      )}

      {period && (
        <>
          <ScreenSection gap={0}>
            {/* Generated from the clock, newest first, so the first chip is always
                the month and year the collector is standing in. */}
            <FilterChips
              title="Billing period"
              chips={periods.map((p) => ({
                id: p.id,
                label: p.current ? `${p.name} (this month)` : p.name,
                count: p.totalInvoices,
              }))}
              selectedId={period.id}
              onSelect={(id) => {
                setSelectedPeriodId(id);
                setSyncFilter(null);
              }}
              accessibilityLabel="Choose a billing period"
            />
          </ScreenSection>

          {/* Two tiles, where there were four.
                "Total Collected" and "Collection Rate" are gone: both measure cash
                received, on a screen belonging to someone who receives none — TWD's
                collectors read meters and payment happens at the office. What
                remains is what this work actually produces: the amount billed out
                of the readings taken, and how many invoices that is.

                Two per row, not three. Three ₱ figures across a 375px screen left
                each value ~50px of text width, which is what wrapped "₱18500.00"
                into "₱1850" / "0.00". Money needs room. */}
          <ScreenSection>
            <View style={styles.summaryRow}>
              <ThemedView type="backgroundElement" style={styles.summaryCard}>
                <ThemedText type="small" themeColor="textSecondary">
                  Total Billed
                </ThemedText>
                {/* No colour override: ThemedText already renders `theme.text`, and
                    restating it was a second opinion that could only ever drift. */}
                <ThemedText
                  style={styles.summaryAmount}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                >
                  {formatPeso(period.totalBilled)}
                </ThemedText>
              </ThemedView>
              <ThemedView type="backgroundElement" style={styles.summaryCard}>
                <ThemedText type="small" themeColor="textSecondary">
                  Invoices
                </ThemedText>
                <ThemedText style={styles.summaryNumber} numberOfLines={1}>
                  {period.totalInvoices}
                </ThemedText>
              </ThemedView>
            </View>
          </ScreenSection>

          {/* Stated whenever it is true, not buried in the list: a total that
              includes unsent records is a claim about this handset, not about what
              the office holds. */}
          {period.pendingSync > 0 && (
            <ScreenSection>
              <PendingNote count={period.pendingSync} />
            </ScreenSection>
          )}

          <ScreenSection>
            <PrintButton
              label="Print Report"
              variant="primary"
              job={printReportJob}
              accessibilityHint="Prints this period's billing summary to the thermal printer"
            />
          </ScreenSection>

          <ScreenSection>
            <View style={styles.sectionHeading}>
              <ThemedText type="defaultBold" style={styles.sectionTitle}>
                Invoice Details
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {visibleInvoices.length === period.totalInvoices
                  ? period.totalInvoices === 1
                    ? "1 invoice"
                    : `${period.totalInvoices} invoices`
                  : `${visibleInvoices.length} of ${period.totalInvoices}`}
              </ThemedText>
            </View>

            {/* Sent / Pending sync, not Billed / Paid / Overdue.
                  Payment status is not something this app can see: the collector
                  takes no money and the district's payment record lives in the
                  portal, behind an endpoint scoped to the consumer who owns the
                  account. Calling a bill "Overdue" from its due date alone would be
                  an assertion about a payment nobody here can observe. Whether the
                  invoice has reached TWD is knowable, is actionable, and is the one
                  thing the collector is responsible for. */}
            {period.totalInvoices > 0 && (
              <FilterChips
                chips={[
                  { id: "sent", label: "Sent to TWD", count: sentCount },
                  { id: "pending", label: "Pending sync", count: period.pendingSync },
                ]}
                selectedId={syncFilter}
                onSelect={(id) => setSyncFilter(id as SyncFilter | null)}
                allLabel="All"
                allCount={period.totalInvoices}
                accessibilityLabel="Filter invoices by whether TWD has received them"
              />
            )}

            {period.totalInvoices === 0 && (
              <ListEmpty
                icon="file-chart"
                title={
                  period.current
                    ? "Nothing billed yet this month"
                    : "No invoices in this period"
                }
                body={
                  period.current
                    ? "Read a meter on your route and the invoice it produces will appear here."
                    : "No meter readings were recorded on this phone during this month."
                }
              />
            )}

            {period.totalInvoices > 0 && visibleInvoices.length === 0 && (
              <ListEmpty
                icon="file-chart"
                title="No invoices match"
                body="Nothing in this period matches the selected filter."
                action={{ label: "Show all", onPress: () => setSyncFilter(null) }}
              />
            )}

            {visibleInvoices.map((invoice) => (
              <InvoiceCard key={invoice.id} invoice={invoice} />
            ))}
          </ScreenSection>
        </>
      )}
    </ScreenContainer>
  );
}

function PendingNote({ count }: { count: number }) {
  const theme = useTwdTheme();

  return (
    <View
      style={[
        styles.pendingNote,
        { borderColor: theme.warning, backgroundColor: theme.warningSurface },
      ]}
      accessible
      accessibilityRole="summary"
    >
      <ThemedText type="small" style={{ color: theme.warning }}>
        {count === 1
          ? "1 invoice in this period has not reached TWD yet. These totals describe this phone, not the office record."
          : `${count} invoices in this period have not reached TWD yet. These totals describe this phone, not the office record.`}
      </ThemedText>
    </View>
  );
}

/**
 * One invoice.
 *
 * The old card was four label/value rows and a meter strip, all weighted the same:
 * "Address", "Billing Period", "Amount", "Due Date" in identical grey, with the
 * peso figure — the only number anyone opens this list for — sitting in the third
 * row at body size, indistinguishable from the address above it. A collector
 * scanning the list had to read every row of every card.
 *
 * So it is re-cut around what the card is actually asked:
 *
 *   • WHO — account number and name, top, with the sync badge.
 *   • HOW MUCH — the amount promoted to a display figure on its own line. It is the
 *     answer to the question; it should be legible without reading.
 *   • WHEN — the due date beside it.
 *   • WHERE — address, demoted to a supporting line.
 *   • The meter row last: Previous / Current / Used.
 *
 * BORDERS. The card previously had none: it was a `backgroundElement` fill on a
 * page background, which in light mode is #F0F0F3 on #ffffff — a 1.14:1
 * separation, well under the 3:1 WCAG 1.4.11 floor for a UI boundary, and simply
 * invisible outdoors. It now carries a real themed border, drawn in the warning
 * colour at 2px for an invoice TWD has not received — the one row in the list with
 * something outstanding on it.
 *
 * What was removed is the *other* kind of border: the meter divider was
 * `borderTopColor: "rgba(0,0,0,0.1)"` — a hardcoded black wash that does not exist
 * in the theme and is invisible on the dark surface.
 */
function InvoiceCard({ invoice }: { invoice: PeriodInvoice }) {
  const theme = useTwdTheme();
  const pending = !invoice.synced;

  return (
    <View
      style={[
        styles.invoiceCard,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: pending ? theme.warning : theme.border,
          borderWidth: pending ? 2 : 1,
        },
      ]}
      accessible
      accessibilityRole="summary"
      accessibilityLabel={`${invoice.accountNumber}, ${invoice.consumerName}, ${formatPeso(
        invoice.amount,
      )}, due ${formatDate(invoice.dueDate)}, ${pending ? "not yet sent to TWD" : "sent to TWD"}`}
    >
      <View style={styles.cardHeader}>
        <View style={styles.headerText}>
          <ThemedText
            type="defaultBold"
            style={styles.cardTitle}
            numberOfLines={1}
          >
            {invoice.accountNumber}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {invoice.consumerName}
          </ThemedText>
        </View>
        <SyncBadge status={invoice.synced ? "synced" : "pending"} />
      </View>

      <View style={styles.amountRow}>
        <ThemedText
          style={styles.amount}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          {formatPeso(invoice.amount)}
        </ThemedText>
        <View style={styles.dueBlock}>
          <ThemedText type="small" themeColor="textSecondary">
            Due
          </ThemedText>
          <ThemedText type="smallBold">{formatDate(invoice.dueDate)}</ThemedText>
        </View>
      </View>

      {invoice.address !== "" && (
        <ThemedText
          type="small"
          themeColor="textSecondary"
          style={styles.supporting}
        >
          {invoice.address}
        </ThemedText>
      )}

      <View style={[styles.meterSection, { borderTopColor: theme.border }]}>
        {(
          [
            ["Previous", `${invoice.previousReading}`],
            ["Current", `${invoice.currentReading}`],
            ["Used", `${invoice.consumption} m³`],
          ] as const
        ).map(([label, value]) => (
          <View key={label} style={styles.meterItem}>
            <ThemedText type="small" themeColor="textSecondary">
              {label}
            </ThemedText>
            <ThemedText type="defaultBold">{value}</ThemedText>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.three,
    marginBottom: Spacing.two,
  },
  sectionTitle: {
    fontSize: 16,
  },
  summaryRow: {
    flexDirection: "row",
    gap: Spacing.three,
  },
  summaryCard: {
    flex: 1,
    borderRadius: Radius.card,
    // Was Spacing.four (24) each side, eating half the tile's width on a phone.
    padding: Spacing.three,
    gap: Spacing.one,
    alignItems: "center",
  },
  /**
   * fontSize AND lineHeight, together.
   *
   * These were `type="title"` + a fontSize-only override. `title` carries
   * lineHeight: 52 for a 48px glyph; overriding fontSize to 20 left the 52px line
   * box behind, so once the value wrapped, the two lines rendered in colliding
   * boxes — the "strikethrough with a stray 0.00 under it". Dropping `type` and
   * declaring both here means the metrics can't be inherited apart.
   */
  summaryAmount: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "700",
  },
  summaryNumber: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "700",
  },
  pendingNote: {
    padding: Spacing.three,
    borderRadius: Radius.card,
    borderWidth: 2,
  },
  invoiceCard: {
    borderRadius: Radius.card,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  headerText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: Spacing.three,
  },
  /**
   * fontSize AND lineHeight together — see `summaryAmount`. A figure that shrinks
   * to fit (`adjustsFontSizeToFit`) inside an inherited line box is the same
   * collision, one screen down.
   */
  amount: {
    flex: 1,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "700",
  },
  dueBlock: {
    alignItems: "flex-end",
    gap: Spacing.half,
  },
  /**
   * The supporting line must be allowed to shrink and wrap.
   *
   * A long address left unbounded reports its full unwrapped width as the row's
   * intrinsic width, which propagates up through the card to the screen container
   * and — because that container centres overflow rather than clipping it — eats
   * the horizontal gutter symmetrically, so the card's edge distance silently
   * tracked whichever invoices the active filter happened to show. As a plain
   * block-level Text inside a column this wraps by default; the note stays because
   * the failure was invisible and is one `flexDirection: "row"` away from
   * returning.
   */
  supporting: {
    lineHeight: 20,
  },
  meterSection: {
    flexDirection: "row",
    gap: Spacing.three,
    paddingTop: Spacing.three,
    // Themed, not `rgba(0,0,0,0.1)`. The old hardcoded wash was invisible against
    // the dark surface and the only non-theme colour on the screen.
    borderTopWidth: 1,
  },
  meterItem: {
    flex: 1,
    alignItems: "center",
    gap: Spacing.half,
  },
});
