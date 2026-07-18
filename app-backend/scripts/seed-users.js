/**
 * Seed development login accounts.
 *
 * Why this exists: POST /auth/register only ever creates Consumers, so there is no
 * self-service way to get a Collector. In production, staff accounts come from the
 * Admin Portal. For local development, they come from here.
 *
 * Idempotent — re-running resets these accounts to the passwords below rather than
 * failing on the unique email index.
 *
 *   node scripts/seed-users.js
 *
 * DEVELOPMENT ONLY. These passwords are public knowledge (they are committed to the
 * repo), so this refuses to run against anything that looks like production.
 */
require('dotenv').config();

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');
const Collector = require('../models/Collector');
const Consumer = require('../models/Consumer');

const MODEL_BY_ROLE = { Collector, Consumer };

const SEED_USERS = [
  {
    name: 'Ana Reyes',
    email: 'collector@twd.test',
    password: 'collector123',
    role: 'Collector',
    employeeId: 'COL-DEV-001',
    routeIds: ['R-01', 'R-02'],
  },
  {
    name: 'Ben Cruz',
    email: 'consumer@twd.test',
    password: 'consumer123',
    role: 'Consumer',
    accountNumbers: ['WD-12345', 'WD-67890'],
  },
  {
    // For exercising the ACCOUNT_DISABLED screen.
    name: 'Carla Santos',
    email: 'disabled@twd.test',
    password: 'disabled123',
    role: 'Consumer',
    status: 'disabled',
  },
];

async function seed() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed known-weak passwords with NODE_ENV=production.');
  }

  await connectDB(process.env.MONGO_URI);

  for (const { password, role, ...fields } of SEED_USERS) {
    // Collector/Consumer each live in their own collection now — role picks
    // the model, but Collector.role/Consumer.role are fixed/immutable, so
    // role isn't part of the fields written for them (only for User/Admin).
    const Model = MODEL_BY_ROLE[role] || User;
    const modelFields = Model === User ? { ...fields, role } : fields;

    const existing = await Model.findByEmail(fields.email);
    if (existing) {
      // Reset rather than skip, so a forgotten seed password is always recoverable.
      Object.assign(existing, modelFields);
      existing.passwordHash = await require('bcryptjs').hash(password, 10);
      await existing.save();
      console.log(`updated  ${role.padEnd(9)} ${fields.email}`);
    } else {
      await Model.createWithPassword({ ...modelFields, password });
      console.log(`created  ${role.padEnd(9)} ${fields.email}`);
    }
  }

  console.log('\nSeeded accounts (development only):');
  for (const u of SEED_USERS) {
    const note = u.status === 'disabled' ? '  [disabled — for testing the locked-account screen]' : '';
    console.log(`  ${u.role.padEnd(9)} ${u.email.padEnd(22)} ${u.password}${note}`);
  }

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
