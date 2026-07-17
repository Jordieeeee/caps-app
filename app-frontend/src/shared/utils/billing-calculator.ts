import { formatAmount } from '@/shared/format/currency';

/**
 * Billing arithmetic and receipt layout for the collector's meter-reading flow.
 *
 * Pure by design — no React, no storage, no printer. The collector prints a bill
 * in front of the consumer, offline, with no way to check it against the server,
 * so this is the last place the number can be wrong before it becomes a piece of
 * paper someone pays against. Keeping it free of I/O is what makes it checkable
 * on its own.
 */

// TODO: Replace with actual TWD rate schedule from client. Every figure below is
// a placeholder supplied with the spec, not a rate confirmed by TWD.
export const MINIMUM_CHARGE = 140.0; // 0–10 m³
export const BLOCK_1_RATE = 21.0; // 11–20 m³
export const BLOCK_2_RATE = 36.0; // 21–30 m³
export const BLOCK_3_RATE = 43.0; // 31–40 m³
export const BLOCK_4_RATE = 48.0; // 41+ m³
export const VAT_RATE = 0.12;

/**
 * TWD's VAT registration number, printed in the receipt header.
 *
 * Empty until the client supplies it, and the header line is omitted entirely
 * while it is — a receipt that prints "VAT Reg TIN: 000-000-000-00000" is worse
 * than one that prints no TIN line at all, because the first is a false statement
 * on a tax document and the second is visibly incomplete.
 */
// TODO: Supply TWD's real VAT registration TIN.
export const TWD_TIN = '';

export const UTILITY_NAME = 'TANAUAN CITY WATER DISTRICT';
export const UTILITY_ADDRESS = 'Tanauan City, Batangas';

/** The PT-210 prints 32 characters per line at Font A on 58mm paper. */
export const RECEIPT_WIDTH = 32;

/** Days between reading date and due date. */
// TODO: Confirm TWD's actual payment window.
export const DUE_DAYS = 15;

export type RateClass = 'Residential' | 'Commercial';

/**
 * An account as pre-loaded onto the phone before the collector goes offline.
 * `previousReading` is the server's last confirmed reading — the number this
 * month's consumption is measured from.
 */
export interface RouteAccount {
  id: string;
  /** Walk order. The collector's route is a physical path, not a sorted list. */
  sequence: number;
  accountNumber: string;
  consumerName: string;
  address: string;
  meterNumber: string;
  previousReading: number;
  rateClass: RateClass;
}

export interface Bill {
  basicCharge: number;
  vat: number;
  vatableSales: number;
  seniorCitizenDiscount: number;
  reconnectionFee: number;
  sewerConnectionFee: number;
  desludgingFee: number;
  waterTankering: number;
  others: number;
  otherChargesVat: number;
  totalCurrentCharges: number;
  totalAmountDue: number;
}

export interface ReceiptInvoice {
  invoiceNo: string;
  /** Reading date, `YYYY-MM-DD`. Also the billing date. */
  date: string;
  dueDate: string;
  billingPeriod: string;
  previousReading: number;
  currentReading: number;
  consumption: number;
  bill: Bill;
  collectorName: string;
  /** Epoch ms. Printed as the "Printed:" stamp. */
  printedAt: number;
}

/**
 * Round to centavos.
 *
 * `245 * 0.12` is `29.400000000000002` in IEEE-754 doubles, and a total built by
 * adding unrounded products lands on figures like `274.40000000000003`. That is
 * not a rounding nicety on a receipt — it is the amount a consumer is being asked
 * to pay, and it has to be a number that exists in currency. Every value leaving
 * `calculateBill` passes through here.
 */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Inclining block tariff: each block's rate applies only to the cubic metres
 * falling inside it, not to the whole consumption.
 */
export function calculateBasicCharge(consumption: number): number {
  if (!Number.isFinite(consumption) || consumption <= 10) return MINIMUM_CHARGE;

  let charge = MINIMUM_CHARGE;
  charge += Math.min(consumption - 10, 10) * BLOCK_1_RATE;
  if (consumption > 20) charge += Math.min(consumption - 20, 10) * BLOCK_2_RATE;
  if (consumption > 30) charge += Math.min(consumption - 30, 10) * BLOCK_3_RATE;
  if (consumption > 40) charge += (consumption - 40) * BLOCK_4_RATE;

  return round2(charge);
}

export function calculateBill(consumption: number): Bill {
  const basicCharge = calculateBasicCharge(consumption);
  const vat = round2(basicCharge * VAT_RATE);
  const total = round2(basicCharge + vat);

  return {
    basicCharge,
    vat,
    vatableSales: basicCharge,
    seniorCitizenDiscount: 0,
    reconnectionFee: 0,
    sewerConnectionFee: 0,
    desludgingFee: 0,
    waterTankering: 0,
    others: 0,
    otherChargesVat: 0,
    totalCurrentCharges: total,
    totalAmountDue: total,
  };
}

/**
 * The bill's reference number.
 *
 * Account plus reading date, because those are the two things both the phone and
 * the server already agree on — the collector can read it aloud over the counter,
 * and TWD can reconstruct it from the synced record without the phone being
 * present. Deliberately not the record's `clientId`: that is the sync primary key
 * and it is 24 characters of base-36, which is not a number a consumer can quote.
 */
export function invoiceNumberFor(accountNumber: string, readingDate: string): string {
  return `${accountNumber}-${readingDate.replace(/-/g, '')}`;
}

/** `2025-07-17` → `2025-08-01` at DUE_DAYS = 15. */
export function dueDateFor(readingDate: string): string {
  const d = new Date(`${readingDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + DUE_DAYS);
  return d.toISOString().split('T')[0];
}

/**
 * The month being billed, as a consumer reads it: `Jun 17 - Jul 17, 2025`.
 */
export function billingPeriodFor(readingDate: string): string {
  const end = new Date(`${readingDate}T00:00:00Z`);
  const start = new Date(end);
  start.setUTCMonth(start.getUTCMonth() - 1);
  const month = (d: Date) => MONTHS[d.getUTCMonth()];
  return `${month(start)} ${start.getUTCDate()} - ${month(end)} ${end.getUTCDate()}, ${end.getUTCFullYear()}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ── Layout primitives ────────────────────────────────────────────────────────
// Each returns lines of at most RECEIPT_WIDTH characters. Nothing here pads a
// line out to full width with trailing spaces: trailing blanks cost thermal paper
// nothing to print but make the output impossible to diff in a test.

const RULE = '='.repeat(RECEIPT_WIDTH);
const THIN_RULE = '-'.repeat(RECEIPT_WIDTH);

function center(text: string): string {
  const t = text.length > RECEIPT_WIDTH ? text.slice(0, RECEIPT_WIDTH) : text;
  return ' '.repeat(Math.floor((RECEIPT_WIDTH - t.length) / 2)) + t;
}

/**
 * `label` left, `value` hard against the right margin — the alignment that lets
 * someone read a column of amounts without reading the words.
 */
function row(label: string, value: string): string {
  const gap = RECEIPT_WIDTH - label.length - value.length;
  if (gap < 1) {
    // Truncating the label is the right sacrifice: the amount is the part that
    // must survive intact.
    const room = Math.max(0, RECEIPT_WIDTH - value.length - 1);
    return `${label.slice(0, room)} ${value}`;
  }
  return label + ' '.repeat(gap) + value;
}

function money(label: string, amount: number): string {
  return row(label, formatAmount(amount));
}

/** Greedy wrap. Words longer than the line are hard-split rather than dropped. */
function wrap(text: string, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [];

  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    if (word.length > width) {
      if (line) {
        lines.push(line);
        line = '';
      }
      for (let i = 0; i < word.length; i += width) lines.push(word.slice(i, i + width));
      continue;
    }
    if (!line) line = word;
    else if (line.length + 1 + word.length <= width) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * `Address: 24 Mabini Street, Brgy…` wrapped with a hanging indent, so a
 * continuation line is visibly part of the field above it rather than a new one.
 */
function field(label: string, value: string): string[] {
  const lines = wrap(`${label} ${value}`, RECEIPT_WIDTH);
  return lines.map((l, i) => (i === 0 ? l : `  ${l}`.slice(0, RECEIPT_WIDTH)));
}

function stamp(epochMs: number): string {
  const d = new Date(epochMs);
  const p = (n: number) => `${n}`.padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ── Receipts ─────────────────────────────────────────────────────────────────

/**
 * The full water bill, one string per printed line.
 *
 * Returns lines, not a blob, because the caller is a byte-oriented printer
 * transport that has to chunk anyway — and because an array of 32-char strings is
 * something you can assert against without a printer attached.
 */
export function formatReceiptLines(invoice: ReceiptInvoice, account: RouteAccount): string[] {
  const b = invoice.bill;
  const lines: string[] = [];

  lines.push(RULE);
  lines.push(center(UTILITY_NAME));
  lines.push(center(UTILITY_ADDRESS));
  if (TWD_TIN) lines.push(center(`VAT Reg TIN: ${TWD_TIN}`));
  lines.push(RULE);

  lines.push(center('INVOICE'));
  lines.push(...field('Invoice No:', invoice.invoiceNo));
  lines.push(row('Date:', invoice.date));
  lines.push(row('Due Date:', invoice.dueDate));
  lines.push(RULE);

  lines.push(...field('Consumer:', account.consumerName));
  lines.push(...field('Account No:', account.accountNumber));
  lines.push(...field('Address:', account.address));
  lines.push(...field('Rate Class:', account.rateClass));
  lines.push(RULE);

  lines.push('BILLING INFORMATION');
  lines.push(row('Billing Date:', invoice.date));
  lines.push(...field('Billing Period:', invoice.billingPeriod));
  lines.push(...field('Meter No:', account.meterNumber));
  lines.push(row('Previous Reading:', `${invoice.previousReading}`));
  lines.push(row('Current Reading:', `${invoice.currentReading}`));
  lines.push(row('Consumption:', `${invoice.consumption} cu.m.`));
  lines.push(RULE);

  lines.push('WATER CHARGES');
  lines.push(money('Basic Charge:', b.basicCharge));
  lines.push(money('Sr. Citizen Disc:', b.seniorCitizenDiscount));
  lines.push(money('VAT:', b.vat));
  lines.push(money('SUBTOTAL:', round2(b.basicCharge + b.vat - b.seniorCitizenDiscount)));
  lines.push(THIN_RULE);

  const otherCharges = round2(
    b.reconnectionFee + b.sewerConnectionFee + b.desludgingFee + b.waterTankering + b.others
  );
  lines.push('OTHER CHARGES');
  lines.push(money('Reconnection Fee:', b.reconnectionFee));
  lines.push(money('Sewer Conn. Fee:', b.sewerConnectionFee));
  lines.push(money('Desludging Fee:', b.desludgingFee));
  lines.push(money('Water Tankering:', b.waterTankering));
  lines.push(money('Others:', b.others));
  lines.push(money('VAT:', b.otherChargesVat));
  lines.push(money('SUBTOTAL:', round2(otherCharges + b.otherChargesVat)));
  lines.push(RULE);

  lines.push(money('Total Current Charges:', b.totalCurrentCharges));
  lines.push(money('VATable Sales:', b.vatableSales));
  lines.push(money('VAT Zero-rated:', 0));
  lines.push(money('VAT Exempt:', 0));
  lines.push(money('VAT:', round2(b.vat + b.otherChargesVat)));
  lines.push(RULE);

  lines.push(money('TOTAL AMOUNT DUE:', b.totalAmountDue));
  lines.push(row('DUE DATE:', invoice.dueDate));
  lines.push(RULE);

  lines.push('IMPORTANT REMINDERS');
  // No penalty figure: TWD has not supplied one, and a peso amount invented on
  // this line would be a demand for money the client never authorised.
  lines.push(...numbered(1, 'Pay on or before due date to avoid disconnection.'));
  lines.push(...numbered(2, 'Non-payment results in penalty and temporary disconnection.'));
  lines.push(RULE);

  lines.push(...field('Collector:', invoice.collectorName));
  lines.push(row('Printed:', stamp(invoice.printedAt)));
  lines.push(RULE);

  return lines;
}

/** `1. Pay on or before due date to` / `   avoid disconnection.` */
function numbered(n: number, text: string): string[] {
  const prefix = `${n}. `;
  const body = wrap(text, RECEIPT_WIDTH - prefix.length);
  return body.map((l, i) => (i === 0 ? prefix + l : ' '.repeat(prefix.length) + l));
}

export type NoticeKind = 'reconnection' | 'disconnection';

export interface ServiceNotice {
  kind: NoticeKind;
  accountNumber: string;
  consumerName: string;
  address: string;
  collectorName: string;
  /** Epoch ms — the moment the collector confirmed the work, not print time. */
  confirmedAt: number;
  note?: string;
}

/**
 * The reconnection/disconnection slip.
 *
 * Deliberately short. This is handed over at a gate, often to someone who is not
 * happy to receive it, and the only facts that matter are which account, what
 * happened, and who to argue with. The disconnection wording carries the way back
 * — a notice that states a penalty without stating the remedy is just a threat.
 */
export function formatNoticeLines(notice: ServiceNotice): string[] {
  const reconnected = notice.kind === 'reconnection';
  const lines: string[] = [];

  lines.push(RULE);
  lines.push(center(UTILITY_NAME));
  lines.push(center(UTILITY_ADDRESS));
  lines.push(RULE);
  lines.push(center(reconnected ? 'RECONNECTION NOTICE' : 'DISCONNECTION NOTICE'));
  lines.push(RULE);

  lines.push(...field('Account No:', notice.accountNumber));
  lines.push(...field('Consumer:', notice.consumerName));
  lines.push(...field('Address:', notice.address));
  lines.push(row('Date:', stamp(notice.confirmedAt)));
  lines.push(RULE);

  lines.push(
    ...wrap(
      reconnected
        ? 'Water service has been reconnected.'
        : 'Water service has been disconnected. Settle balance to restore service.',
      RECEIPT_WIDTH
    )
  );

  if (notice.note?.trim()) {
    lines.push(THIN_RULE);
    lines.push(...field('Note:', notice.note.trim()));
  }

  lines.push(RULE);
  lines.push(...field('Collector:', notice.collectorName));
  lines.push(row('Printed:', stamp(notice.confirmedAt)));
  lines.push(RULE);

  return lines;
}
