/**
 * Philippine peso formatting.
 *
 * Hand-rolled rather than Intl.NumberFormat: Hermes ships Intl, but its ICU data
 * varies by platform and RN version, and a currency that silently renders as
 * "PHP 18,500.00" on one device and "₱18,500.00" on another is not something a
 * collector reconciling cash at the end of a shift should have to absorb. This is
 * deterministic everywhere and testable without a device.
 *
 * Grouping is what the previous `₱${n.toFixed(2)}` was missing, and it was not
 * cosmetic: "₱18500.00" is one unbroken 9-character token, which is precisely why
 * it wrapped mid-number into "₱1850" / "0.00" inside a narrow card.
 */

/** `18500` → `"₱18,500.00"`. Always two decimals; always grouped. */
export function formatPeso(amount: number): string {
  if (!Number.isFinite(amount)) return '₱—';
  const negative = amount < 0;
  const [whole, fraction] = Math.abs(amount).toFixed(2).split('.');
  return `${negative ? '-' : ''}₱${group(whole)}.${fraction}`;
}

/**
 * `18500` → `"₱18.5K"`. For summary tiles that genuinely cannot fit the full
 * figure. Use sparingly: an abbreviated peso amount is not a number a collector
 * can reconcile against, so it belongs on an at-a-glance tile and never on a
 * receipt, a total being counted, or anything printed.
 */
export function formatPesoCompact(amount: number): string {
  if (!Number.isFinite(amount)) return '₱—';
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}₱${trim(abs / 1_000_000)}M`;
  if (abs >= 10_000) return `${sign}₱${trim(abs / 1_000)}K`;
  return formatPeso(amount);
}

/**
 * `18500` → `"18,500.00"`. Same number, no symbol.
 *
 * For the thermal printer. The PT-210 prints from a single-byte codepage that has
 * no ₱ glyph in any of the variants these units ship with, so `formatPeso`'s
 * symbol would emit one byte the printer renders as whatever sits at that
 * position — a stray "P", a box, or nothing. The receipt template says "Basic
 * Charge: 245.00" for that reason, and this is the formatter that produces it.
 */
export function formatAmount(amount: number): string {
  if (!Number.isFinite(amount)) return '—';
  const negative = amount < 0;
  const [whole, fraction] = Math.abs(amount).toFixed(2).split('.');
  return `${negative ? '-' : ''}${group(whole)}.${fraction}`;
}

function group(whole: string): string {
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** One decimal, but never a trailing ".0" — "18.5K", "2K". */
function trim(n: number): string {
  return n.toFixed(1).replace(/\.0$/, '');
}
