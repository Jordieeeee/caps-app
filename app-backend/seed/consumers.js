/**
 * Seed the ten Consumer Directory accounts (Account + linked User login).
 *
 *   node seed/consumers.js
 *
 * Idempotent: Account is keyed on `accountNumber`, Consumer on `email`, both via
 * upsert. Re-running updates the ten in place rather than duplicating them or
 * throwing on a unique index. Passwords are re-hashed every run, so a forgotten
 * seed password is always recoverable — the corollary being that a password
 * changed elsewhere gets reset by the next run.
 *
 * Deliberately NOT written here: `Outstanding` and payment `Status`
 * (Active/Delinquent/Past Due) from the source table. Neither is a field on
 * Account — Account.status is a service-activation flag ('active'/'inactive'),
 * not a delinquency flag (see models/Consumer.js's note on this), and the running
 * balance is `Billing`, a per-billing-period record this script has no
 * billingPeriod/dueDate data to construct. Writing them onto Account would
 * misuse a field and fabricate data that wasn't supplied. See the logged note
 * per account below.
 *
 * DEVELOPMENT ONLY. Passwords are derived from the holders' own names and are
 * committed to this repository, which makes them public and guessable in equal
 * measure. This refuses to run with NODE_ENV=production for that reason.
 */
require('dotenv').config();

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const connectDB = require('../config/db');
const Consumer = require('../models/Consumer');
const Account = require('../models/Account');

/**
 * Must match the registration flow exactly, or seeded consumers cannot log in.
 *
 * `Consumer.createWithPassword` hashes with bcryptjs at cost 10 (models/Consumer.js),
 * and `comparePassword` verifies against it. This script cannot call
 * `createWithPassword` — that method issues an insert, and we need an upsert —
 * so the cost is restated here.
 */
const SALT_ROUNDS = 10;

// Schema's spellings, not the source table's ("Residential" -> 'residential', etc).
const TYPE_MAP = {
  Residential: 'residential',
  Commercial: 'commercial',
  Government: 'government',
};

const CONSUMERS = [
  {
    accountNumber: 'ACC-2026-0001',
    name: 'Pedro Dela Cruz',
    address: 'Brgy. Poblacion 1, Tanauan City',
    type: 'Residential',
    outstanding: 0.0,
    paymentStatus: 'Active',
    email: 'pedrodelacruz@gmail.com',
    password: 'PedroDelaCruz@123',
  },
  {
    accountNumber: 'ACC-2026-0002',
    name: 'Ana Marie Santos',
    address: 'Brgy. Darasa, Tanauan City',
    type: 'Residential',
    outstanding: 245.75,
    paymentStatus: 'Active',
    email: 'anamariesantos@gmail.com',
    password: 'AnaMarieSantos@123',
  },
  {
    accountNumber: 'ACC-2026-0003',
    name: 'Michael Reyes',
    address: 'Brgy. Santor, Tanauan City',
    type: 'Commercial',
    outstanding: 1250.0,
    paymentStatus: 'Delinquent',
    email: 'michaelreyes@gmail.com',
    password: 'MichaelReyes@123',
  },
  {
    accountNumber: 'ACC-2026-0004',
    name: 'Jennifer Cruz',
    address: 'Brgy. Bagbag, Tanauan City',
    type: 'Residential',
    outstanding: 98.5,
    paymentStatus: 'Active',
    email: 'jennifercruz@gmail.com',
    password: 'JenniferCruz@123',
  },
  {
    accountNumber: 'ACC-2026-0005',
    name: 'Carlo Mendoza',
    address: 'Brgy. Banjo East, Tanauan City',
    type: 'Government',
    outstanding: 0.0,
    paymentStatus: 'Active',
    email: 'carlomendoza@gmail.com',
    password: 'CarloMendoza@123',
  },
  {
    accountNumber: 'ACC-2026-0006',
    name: 'Sophia Garcia',
    address: 'Brgy. Laurel, Tanauan City',
    type: 'Residential',
    outstanding: 430.2,
    paymentStatus: 'Past Due',
    email: 'sophiagarcia@gmail.com',
    password: 'SophiaGarcia@123',
  },
  {
    accountNumber: 'ACC-2026-0007',
    name: 'Joshua Ramos',
    address: 'Brgy. Altura Bata, Tanauan City',
    type: 'Commercial',
    outstanding: 2100.0,
    paymentStatus: 'Delinquent',
    email: 'joshuaramos@gmail.com',
    password: 'JoshuaRamos@123',
  },
  {
    accountNumber: 'ACC-2026-0008',
    name: 'Camille Flores',
    address: 'Brgy. Janopol Oriental, Tanauan City',
    type: 'Residential',
    outstanding: 0.0,
    paymentStatus: 'Active',
    email: 'camilleflores@gmail.com',
    password: 'CamilleFlores@123',
  },
  {
    accountNumber: 'ACC-2026-0009',
    name: 'Daniel Villanueva',
    address: 'Brgy. Boot, Tanauan City',
    type: 'Residential',
    outstanding: 315.4,
    paymentStatus: 'Active',
    email: 'danielvillanueva@gmail.com',
    password: 'DanielVillanueva@123',
  },
  {
    accountNumber: 'ACC-2026-0010',
    name: 'Patricia Hernandez',
    address: 'Brgy. Trapiche, Tanauan City',
    type: 'Commercial',
    outstanding: 780.0,
    paymentStatus: 'Past Due',
    email: 'patriciahernandez@gmail.com',
    password: 'PatriciaHernandez@123',
  },
];

const normaliseEmail = (email) => String(email).toLowerCase().trim();

/**
 * Refuse to write these passwords anywhere they could matter.
 * Same allowlist-by-host approach as seed/employees.js — see that file for why
 * a NODE_ENV-only guard is not sufficient.
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
        `consumers. That is acceptable on a local machine and nowhere else.\n\n` +
        `If you genuinely mean to write them to ${host}, re-run with --force.`
    );
  }
}

async function seed() {
  const uri = process.env.MONGO_URI;
  if (uri) assertSafeTarget(uri);

  await connectDB(uri);

  for (const c of CONSUMERS) {
    const email = normaliseEmail(c.email);

    const account = await Account.findOneAndUpdate(
      { accountNumber: c.accountNumber },
      {
        $set: {
          accountNumber: c.accountNumber,
          address: c.address,
          type: TYPE_MAP[c.type],
          status: 'active',
        },
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );

    const user = await Consumer.findOneAndUpdate(
      { email },
      {
        $set: {
          name: c.name,
          email,
          passwordHash: await bcrypt.hash(c.password, SALT_ROUNDS),
          status: 'active',
          accountNumbers: [c.accountNumber],
        },
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );

    // Bidirectional link, same shape as accountController's link flow.
    await Account.updateOne({ _id: account._id }, { $addToSet: { consumerIds: user._id } });

    console.log(
      `seeded  ${c.accountNumber}  ${c.name.padEnd(20)} ${TYPE_MAP[c.type].padEnd(11)} ${email}` +
        `  [outstanding ${c.outstanding.toFixed(2)} / ${c.paymentStatus} not written — belongs on Billing, not Account]`
    );
  }

  console.log(`\n${CONSUMERS.length} consumer accounts seeded (development only).`);
  console.log('Log in with email + password:\n');
  for (const c of CONSUMERS) {
    console.log(`  ${c.email.padEnd(30)} ${c.password}`);
  }

  await mongoose.disconnect();
}

seed()
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error('Seed failed:', err.message);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
