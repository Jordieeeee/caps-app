/**
 * Identity for a record created offline.
 *
 * This id is the record's primary key on the server: `clientId` is uniquely
 * indexed and every /sync endpoint upserts on it, which is what makes a replayed
 * offline queue idempotent. A collector who syncs the same reading twice must get
 * one reading, not two — and, critically, two *different* records must never
 * collide onto one, because the upsert would silently overwrite the first.
 *
 * Which is exactly what the previous id risked. Records used
 * `Date.now().toString()`: two collections saved inside the same millisecond
 * produced the same id, and `$set` on a unique clientId means the second cash
 * payment overwrites the first. Not a merge, not a duplicate — a payment that
 * quietly stops existing. Tapping Save twice on a laggy phone is enough.
 *
 * No crypto dependency: `expo-crypto` would buy randomUUID, but this id only has
 * to be unique across one collector's outbox, and a millisecond timestamp plus 40
 * bits of randomness plus a per-process counter is far past sufficient for that.
 * The timestamp prefix also keeps ids sortable by creation, which is convenient
 * when reading the queue by eye.
 */

let counter = 0;

export function newClientId(prefix: string): string {
  counter = (counter + 1) % 0xffff;
  const time = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  const seq = counter.toString(36).padStart(3, '0');
  return `${prefix}-${time}-${rand}-${seq}`;
}
