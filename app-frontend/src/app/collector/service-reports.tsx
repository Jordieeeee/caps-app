import { StyleSheet, View } from "react-native";
import { useState } from "react";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { PrinterService } from "@/collector/services/printer-service";
import { formatPeso } from "@/shared/format/currency";
import { FilterChips } from "@/shared/components/filter-chips";
import { ListEmpty } from "@/shared/components/list-states";
import { ScreenHeader } from "@/shared/components/screen-header";
import { PaymentBadge } from "@/shared/components/status-badge";
import { ScreenContainer, ScreenSection } from "@/shared/components/screen-container";
import { PrintButton } from "@/shared/components/print-button";
import { Radius } from "@/shared/theme/twd";

interface Invoice {
	id: string;
	accountNumber: string;
	accountName: string;
	address: string;
	billingPeriod: string;
	amount: number;
	status: "billed" | "paid" | "overdue";
	dueDate: string;
	meterReading: {
		previous: number;
		current: number;
		consumption: number;
	};
}

interface CollectionPeriod {
	id: string;
	name: string;
	startDate: string;
	endDate: string;
	totalInvoices: number;
	totalBilled: number;
	totalCollected: number;
}

const mockCollectionPeriods: CollectionPeriod[] = [
	{
		id: "CP-2025-07",
		name: "July 2025",
		startDate: "2025-07-01",
		endDate: "2025-07-31",
		totalInvoices: 450,
		totalBilled: 202500,
		totalCollected: 137000,
	},
	{
		id: "CP-2025-06",
		name: "June 2025",
		startDate: "2025-06-01",
		endDate: "2025-06-30",
		totalInvoices: 445,
		totalBilled: 198400,
		totalCollected: 198400,
	},
	{
		id: "CP-2025-05",
		name: "May 2025",
		startDate: "2025-05-01",
		endDate: "2025-05-31",
		totalInvoices: 440,
		totalBilled: 191200,
		totalCollected: 188600,
	},
];

const mockInvoices: Invoice[] = [
	{
		id: "INV-001",
		accountNumber: "WD-12345",
		accountName: "Juan Dela Cruz",
		address: "24 Mabini Street, Brgy. Poblacion 3, Tanauan City",
		billingPeriod: "July 2025",
		amount: 486.0,
		status: "billed",
		dueDate: "2025-08-15",
		meterReading: {
			previous: 1250,
			current: 1285,
			consumption: 35,
		},
	},
	{
		id: "INV-002",
		accountNumber: "WD-12346",
		accountName: "Maria Santos",
		address: "117 J.P. Laurel Highway, Brgy. Darasa, Tanauan City",
		billingPeriod: "July 2025",
		amount: 452.75,
		status: "paid",
		dueDate: "2025-08-15",
		meterReading: {
			previous: 980,
			current: 1015,
			consumption: 35,
		},
	},
	{
		id: "INV-003",
		accountNumber: "WD-12347",
		accountName: "Pedro Reyes",
		address: "8 Rizal Avenue, Brgy. Sambat, Tanauan City",
		billingPeriod: "July 2025",
		amount: 1248.5,
		status: "overdue",
		dueDate: "2025-08-15",
		meterReading: {
			previous: 1450,
			current: 1480,
			consumption: 30,
		},
	},
];

export default function ServiceReportsScreen() {
	const theme = useTheme();
	const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(
		mockCollectionPeriods[0].id,
	);
	const [statusFilter, setStatusFilter] = useState<string | null>(null);
	const [invoices] = useState<Invoice[]>(mockInvoices);

	const currentPeriod =
		mockCollectionPeriods.find((p) => p.id === selectedPeriodId) ??
		mockCollectionPeriods[0];
	const billedCount = invoices.filter((i) => i.status === "billed").length;
	const paidCount = invoices.filter((i) => i.status === "paid").length;
	const overdueCount = invoices.filter((i) => i.status === "overdue").length;
	const collectionRate =
		currentPeriod.totalBilled > 0
			? (currentPeriod.totalCollected / currentPeriod.totalBilled) * 100
			: 0;

	const visibleInvoices = statusFilter
		? invoices.filter((i) => i.status === statusFilter)
		: invoices;

	const printReportJob = () =>
		PrinterService.print({
			type: "report",
			title: `SERVICE REPORT - ${currentPeriod.name}`,
			content: [
				`Period: ${currentPeriod.startDate} to ${currentPeriod.endDate}`,
				`Total Invoices: ${currentPeriod.totalInvoices}`,
				`Total Billed: ${formatPeso(currentPeriod.totalBilled)}`,
				`Total Collected: ${formatPeso(currentPeriod.totalCollected)}`,
				`Collection Rate: ${collectionRate.toFixed(1)}%`,
				"--------------------------------",
				`Billed: ${billedCount}`,
				`Paid: ${paidCount}`,
				`Overdue: ${overdueCount}`,
			],
			footer: "End of Service Report",
		});

	return (
		<ScreenContainer>
			<ScreenHeader
				title="Reports"
				subtitle="Billing and collection by period"
			/>

			<ScreenSection gap={0}>
				<ThemedText type="defaultBold" style={styles.sectionTitle}>
					Collection Period
				</ThemedText>
				<FilterChips
					chips={mockCollectionPeriods.map((p) => ({
						id: p.id,
						label: p.name,
					}))}
					selectedId={selectedPeriodId}
					onSelect={setSelectedPeriodId}
					accessibilityLabel="Filter by collection period"
				/>
			</ScreenSection>

			{/* Two tiles per row, not three. Three ₱ figures across a 375px screen left
            each value ~50px of text width, which is what wrapped "₱18500.00" into
            "₱1850" / "0.00". Money needs room; the rate is narrow and can share. */}
			<ScreenSection>
				<View style={styles.summaryRow}>
					<ThemedView type="backgroundElement" style={styles.summaryCard}>
						<ThemedText type="small" themeColor="textSecondary">
							Total Billed
						</ThemedText>
						<ThemedText
							style={styles.summaryAmount}
							numberOfLines={1}
							adjustsFontSizeToFit
							minimumFontScale={0.7}
						>
							{formatPeso(currentPeriod.totalBilled)}
						</ThemedText>
					</ThemedView>
					<ThemedView type="backgroundElement" style={styles.summaryCard}>
						<ThemedText type="small" themeColor="textSecondary">
							Total Collected
						</ThemedText>
						<ThemedText
							style={[styles.summaryAmount, { color: theme.text }]}
							numberOfLines={1}
							adjustsFontSizeToFit
							minimumFontScale={0.7}
						>
							{formatPeso(currentPeriod.totalCollected)}
						</ThemedText>
					</ThemedView>
				</View>
			</ScreenSection>

			<ScreenSection>
				<View style={styles.statusRow}>
					<ThemedView type="backgroundElement" style={styles.statusCard}>
						<ThemedText type="small" themeColor="textSecondary">
							Collection Rate
						</ThemedText>
						<ThemedText style={styles.summaryNumber} numberOfLines={1}>
							{collectionRate.toFixed(1)}%
						</ThemedText>
					</ThemedView>
					<ThemedView type="backgroundElement" style={styles.statusCard}>
						<ThemedText type="small" themeColor="textSecondary">
							Invoices
						</ThemedText>
						<ThemedText style={styles.summaryNumber} numberOfLines={1}>
							{billedCount + paidCount + overdueCount}
						</ThemedText>
					</ThemedView>
				</View>
			</ScreenSection>

			<ScreenSection>
				<PrintButton
					label="Print Report"
					variant="primary"
					job={printReportJob}
					accessibilityHint="Prints this period's billing summary to the thermal printer"
				/>
			</ScreenSection>

			<ScreenSection>
				<ThemedText type="defaultBold" style={styles.sectionTitle}>
					Invoice Details
				</ThemedText>

				{/* Filters, not a legend — that was the ambiguity. A row of status pills
              that merely explained colours looked exactly as tappable as the period
              chips above it. Now they ARE tappable, they carry counts so a collector
              can see "Overdue (1)" without scrolling, and they render through the
              same FilterChips component as every other filter row — the selected
              treatment (tinted fill + primary border + bold) is learned once and
              holds everywhere. The badges on the cards remain non-interactive and
              visually distinct: smaller, outline-only, icon + word. */}
				<FilterChips
					chips={[
						{ id: "billed", label: `Billed (${billedCount})` },
						{ id: "paid", label: `Paid (${paidCount})` },
						{ id: "overdue", label: `Overdue (${overdueCount})` },
					]}
					selectedId={statusFilter}
					onSelect={setStatusFilter}
					allLabel={`All (${invoices.length})`}
					accessibilityLabel="Filter invoices by payment status"
				/>

				{visibleInvoices.length === 0 && (
					<ListEmpty
						icon="file-text"
						title="No invoices with this status"
						body="Nothing in this period matches the selected filter. Clear it to see every invoice."
						action={{ label: "Show all", onPress: () => setStatusFilter(null) }}
					/>
				)}

				{visibleInvoices.map((invoice) => (
					<ThemedView
						key={invoice.id}
						type="backgroundElement"
						style={styles.invoiceCard}
					>
						<ThemedView style={styles.cardHeader}>
							<ThemedView style={styles.headerText}>
								<ThemedText type="defaultBold" style={styles.cardTitle}>
									{invoice.accountNumber}
								</ThemedText>
								<ThemedText type="small" themeColor="textSecondary">
									{invoice.accountName}
								</ThemedText>
							</ThemedView>
							<PaymentBadge status={invoice.status} />
						</ThemedView>

						<ThemedView style={styles.cardDetails}>
							<ThemedView style={styles.detailRow}>
								<ThemedText type="small" themeColor="textSecondary">
									Address
								</ThemedText>
								<ThemedText type="small" style={styles.detailValue}>
									{invoice.address}
								</ThemedText>
							</ThemedView>
							<ThemedView style={styles.detailRow}>
								<ThemedText type="small" themeColor="textSecondary">
									Billing Period
								</ThemedText>
								<ThemedText type="small" style={styles.detailValue}>
									{invoice.billingPeriod}
								</ThemedText>
							</ThemedView>
							<ThemedView style={styles.detailRow}>
								<ThemedText type="small" themeColor="textSecondary">
									Amount
								</ThemedText>
								<ThemedText type="defaultBold" style={styles.detailValue}>
									{formatPeso(invoice.amount)}
								</ThemedText>
							</ThemedView>
							<ThemedView style={styles.detailRow}>
								<ThemedText type="small" themeColor="textSecondary">
									Due Date
								</ThemedText>
								<ThemedText type="small" style={styles.detailValue}>
									{invoice.dueDate}
								</ThemedText>
							</ThemedView>
						</ThemedView>

						<ThemedView style={styles.meterSection}>
							<ThemedText type="small" themeColor="textSecondary">
								Meter Reading
							</ThemedText>
							<ThemedView style={styles.meterDetails}>
								<ThemedView style={styles.meterItem}>
									<ThemedText type="small" themeColor="textSecondary">
										Prev
									</ThemedText>
									<ThemedText type="defaultBold">
										{invoice.meterReading.previous}
									</ThemedText>
								</ThemedView>
								<ThemedView style={styles.meterItem}>
									<ThemedText type="small" themeColor="textSecondary">
										Curr
									</ThemedText>
									<ThemedText type="defaultBold">
										{invoice.meterReading.current}
									</ThemedText>
								</ThemedView>
								<ThemedView style={styles.meterItem}>
									<ThemedText type="small" themeColor="textSecondary">
										Cons
									</ThemedText>
									<ThemedText type="defaultBold" style={{ color: theme.text }}>
										{invoice.meterReading.consumption} m³
									</ThemedText>
								</ThemedView>
							</ThemedView>
						</ThemedView>
					</ThemedView>
				))}
			</ScreenSection>
		</ScreenContainer>
	);
}

const styles = StyleSheet.create({
	sectionTitle: {
		fontSize: 16,
		marginBottom: Spacing.two,
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
	statusRow: {
		flexDirection: "row",
		gap: Spacing.three,
	},
	statusCard: {
		flex: 1,
		borderRadius: Radius.card,
		padding: Spacing.three,
		gap: Spacing.one,
		alignItems: "center",
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
	cardDetails: {
		gap: Spacing.two,
	},
	detailRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "flex-start",
		gap: Spacing.three,
	},
	/**
	 * The value column must be allowed to shrink and wrap.
	 *
	 * Without `flex: 1` here a long address reports its full unwrapped width as the
	 * row's intrinsic width, which propagates up through the card to the screen
	 * container and — because that container centres overflow rather than clipping
	 * it — eats the horizontal gutter symmetrically, so the card's edge distance
	 * silently tracked whichever invoices the active filter happened to show.
	 * Bounding the value's width makes the address wrap inside the card instead,
	 * so the card can never exceed the viewport and the gutter is always the
	 * section's paddingHorizontal.
	 */
	detailValue: {
		flex: 1,
		textAlign: "right",
	},
	meterSection: {
		paddingTop: Spacing.two,
		borderTopWidth: 1,
		borderTopColor: "rgba(0,0,0,0.1)",
	},
	meterDetails: {
		flexDirection: "row",
		gap: Spacing.three,
		marginTop: Spacing.two,
	},
	meterItem: {
		flex: 1,
		alignItems: "center",
	},
});
