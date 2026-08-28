import type { Account, Bill } from '@/consumer/services/consumer-data';

/**
 * Naming a consumer's water accounts for a chooser.
 *
 * Shared by Home and Bills, which both filter by account and must label the
 * same property the same way. Two screens inventing their own wording for the
 * same meter is how "Boot" on one screen becomes "ACC-2026-0007" on the other.
 */

/**
 * The distinctive part of a service address.
 *
 * Every address in the district ends "…, Tanauan City, Batangas", so those
 * segments separate nothing and are dropped; what remains ends with the
 * barangay, which is how people actually name a property. "Purok 5 Sitio Ople
 * Barangay Boot, Boot, Tanauan City, Batangas" becomes "Boot".
 *
 * Falls back to the account number whenever the result would not be a usable
 * label — no address, or a segment too long for a chip. A plain-looking chip is
 * a small cost: the exact account number is printed on the rows underneath, and
 * the chip only has to be pickable.
 */
export function shortPlace(address: string, fallback: string): string {
  const parts = (address ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !/^(tanauan city|batangas|philippines)$/i.test(part));

  const last = parts[parts.length - 1];
  return last && last.length <= 24 ? last : fallback;
}

/**
 * One chip per account that actually has bills, newest-agnostic and sorted so
 * the row does not reshuffle between screens or refreshes.
 *
 * Built from BILLS rather than from the account list on purpose: an account
 * with no bills yet is a chip that filters to an empty screen, which reads as
 * a broken control rather than as "nothing billed here yet".
 */
export function accountChipsFor(
  bills: Bill[],
  accounts: Account[]
): { id: string; label: string; count: number }[] {
  const placeByAccount = new Map(
    accounts.map((a) => [a.accountNumber, shortPlace(a.address, a.accountNumber)])
  );

  return [...new Set(bills.map((b) => b.accountNumber).filter(Boolean))]
    .map((n) => String(n))
    .sort((a, b) => a.localeCompare(b))
    .map((accountNumber) => ({
      id: accountNumber,
      label: placeByAccount.get(accountNumber) ?? accountNumber,
      count: bills.filter((b) => b.accountNumber === accountNumber).length,
    }));
}
