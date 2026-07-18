/**
 * Seed the five collector logins.
 *
 *   node seed/employees.js
 *
 * Idempotent: keyed on `email`, the unique login identifier, via upsert. Re-running
 * updates the five accounts in place rather than duplicating them or throwing on
 * the unique index. It also re-hashes the passwords every run, so a forgotten seed
 * password is always recoverable — the corollary being that a password changed
 * elsewhere gets reset by the next run.
 *
 * DEVELOPMENT ONLY. The passwords below are derived from the holders' own names and
 * are committed to this repository, which makes them public and guessable in equal
 * measure. This refuses to run with NODE_ENV=production for that reason. If these
 * accounts are meant to be real, they need to be created through the Admin Portal
 * and rotated on first login — not seeded from git.
 */
require('dotenv').config();

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const connectDB = require('../config/db');
const Collector = require('../models/Collector');

/**
 * Must match the registration flow exactly, or seeded users cannot log in.
 *
 * `Collector.createWithPassword` hashes with bcryptjs at cost 10 (models/Collector.js),
 * and `comparePassword` verifies against it. This script cannot call
 * `createWithPassword` — that method issues an insert, and we need an upsert — so
 * the cost is restated here and pinned by the check below.
 */
const SALT_ROUNDS = 10;

/**
 * Status is the schema's spelling, not the spec's.
 *
 * The brief asked for `status: "Active"`, invalid against the Collector enum
 * (`'active'`), and — because `updateOne` skips validators unless told
 * otherwise — would have been written silently and bricked all five accounts:
 * `assertActive()` compares `!== 'active'` → 403 ACCOUNT_DISABLED.
 *
 * `runValidators: true` below is what turns a future casing slip into a loud
 * seed failure instead of five field staff locked out on a Monday morning.
 * `role` itself is no longer written here at all — `Collector.role` is a fixed
 * field (see models/Collector.js), so there's nothing left to mis-spell.
 */
const STATUS = 'active';

/**
 * `routeId` is the identifier; `zone` is the label for it.
 *
 * These are two fields because the database already answered the question: the
 * existing collector carries `routeIds: ['R-01', 'R-02']` and every meter reading
 * stamps `routeId: 'R-01'`. Seeding `routeIds: ['Zone 1 - Poblacion']` would put a
 * second, incompatible spelling of "which route" into the same collection, and the
 * readings these five produce would join to nothing.
 */
const COLLECTORS = [
  {
    employeeId: 'COL-26-001',
    name: 'Juan Dela Cruz',
    routeId: 'R-01',
    zone: 'Zone 1 - Poblacion',
    phone: '0917-123-4567',
    dateHired: '2026-01-15',
    email: 'juandelacruz@gmail.com',
    password: 'JuanDelaCruz@123',
  },
  {
    employeeId: 'COL-26-002',
    name: 'Maria Santos',
    routeId: 'R-02',
    zone: 'Zone 2 - Darasa',
    phone: '0918-234-5678',
    dateHired: '2026-02-03',
    email: 'mariasantos@gmail.com',
    password: 'MariaSantos@123',
  },
  {
    employeeId: 'COL-26-003',
    name: 'Mark Anthony Reyes',
    routeId: 'R-03',
    zone: 'Zone 3 - Santor',
    phone: '0919-345-6789',
    dateHired: '2026-03-12',
    email: 'markanthonyreyes@gmail.com',
    password: 'MarkAnthonyReyes@123',
  },
  {
    employeeId: 'COL-26-004',
    name: 'Angela Mae Cruz',
    routeId: 'R-04',
    zone: 'Zone 4 - Bagbag',
    phone: '0920-456-7890',
    dateHired: '2026-04-08',
    email: 'angelamaecruz@gmail.com',
    password: 'AngelaMaeCruz@123',
  },
  {
    employeeId: 'COL-26-005',
    name: 'Kevin James Mendoza',
    routeId: 'R-05',
    zone: 'Zone 5 - Banjo East',
    phone: '0921-567-8901',
    dateHired: '2026-05-21',
    email: 'kevinjamesmendoza@gmail.com',
    password: 'KevinJamesMendoza@123',
  },
];

/**
 * Normalise the way the schema would.
 *
 * `email` carries `lowercase: true` + `trim: true`, but a setter only fires on the
 * *update document* — it does not touch the filter. An upsert whose filter says
 * `Juan@GMAIL.com` while its `$set` writes `juan@gmail.com` matches nothing and
 * inserts a second row on every run, which is exactly the duplicate this script is
 * supposed to make impossible. So the key is normalised before it is used as both.
 */
const normaliseEmail = (email) => String(email).toLowerCase().trim();

/**
 * Refuse to write these passwords anywhere they could matter.
 *
 * `NODE_ENV === 'production'` is not sufficient here, and that is not theoretical:
 * in this repo NODE_ENV is unset while .env points MONGO_URI at
 * `mongodb+srv://…@admin.v6ag6su.mongodb.net/twd-admin` — the live Admin Portal
 * cluster. A NODE_ENV-only guard reads that as "not production" and seeds five
 * name-derived, git-committed staff passwords into the real database. The variable
 * describes how the process was launched; the URI describes what actually gets
 * written to. Only the second one is load-bearing.
 *
 * So the target host is the check, and it is an allowlist: local hosts pass,
 * everything else has to be asked for out loud with --force. Defaulting to refusal
 * means a mistyped or inherited .env fails safe.
 */
function assertSafeTarget(uri) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed known-weak passwords with NODE_ENV=production.');
  }

  const host = (uri.match(/@([^/?]+)/) || uri.match(/mongodb:\/\/([^/?]+)/) || [])[1] || '';
  const isLocal = /^(localhost|127\.0\.0\.1|\[::1\]|host\.docker\.internal)(:\d+)?$/.test(host);

  if (!isLocal && !process.argv.includes('--force')) {
    throw new Error(
      `Refusing to seed a non-local database.\n\n` +
        `  MONGO_URI points at: ${host}\n\n` +
        `These passwords are derived from the holders' own names and are committed to\n` +
        `this repository, so anyone with the repo — or a guess — can log in as these\n` +
        `collectors. That is acceptable on a local machine and nowhere else.\n\n` +
        `If you genuinely mean to write them to ${host}, re-run with --force.`
    );
  }
}

async function seed() {
  const uri = process.env.MONGO_URI;
  // Before connecting, not after: the point is to not touch the cluster at all.
  // config/db.js owns the "is it set at all" check.
  if (uri) assertSafeTarget(uri);

  await connectDB(uri);

  for (const { password, zone, routeId, ...fields } of COLLECTORS) {
    const email = normaliseEmail(fields.email);

    const result = await Collector.updateOne(
      { email },
      {
        $set: {
          ...fields,
          email,
          // A fresh salt per run, so the hash differs every time even though the
          // password does not. Idempotent in effect, not byte-for-byte.
          passwordHash: await bcrypt.hash(password, SALT_ROUNDS),
          status: STATUS,
          // What the app keys on: `routeIds` is the schema's "collectors: assigned
          // routes", read to show a collector their route and to stamp routeId onto
          // each meter reading. Must stay in the R-0N spelling the rest of the
          // database already uses.
          routeIds: [routeId],
          // The same route, spelled for a human. Display only — see models/User.js.
          zone,
        },
      },
      {
        upsert: true,
        // Without this, the enums above are not checked on an upsert and a bad
        // value lands in the database unreported. See the ROLE/STATUS note.
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );

    const action = result.upsertedCount > 0 ? 'created' : 'updated';
    console.log(`${action}  ${fields.employeeId}  ${email.padEnd(28)} ${routeId}  ${zone}`);
  }

  console.log(`\n${COLLECTORS.length} collector accounts seeded (development only).`);
  console.log('Log in with email + password:\n');
  for (const c of COLLECTORS) {
    console.log(`  ${c.email.padEnd(28)} ${c.password}`);
  }

  await mongoose.disconnect();
}

seed()
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error('Seed failed:', err.message);
    // Don't leave the process hanging on an open pool after a mid-loop failure.
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
