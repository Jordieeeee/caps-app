#!/usr/bin/env node
/**
 * Point EXPO_PUBLIC_API_BASE_URL at this Mac's CURRENT LAN address.
 *
 * Runs automatically before `npm start` / `npm run ios` / `npm run android`
 * (npm's pre<script> hooks), because the alternative has cost real debugging
 * time four separate times: the Mac takes a new DHCP lease, the address in the
 * env file goes stale, and the app fails every request with "Cannot reach TWD"
 * — a message that points at the phone's connection when the phone is fine.
 *
 * It writes to .env.local when that file exists, and .env otherwise. That order
 * matters and is the second half of the same bug: Expo loads .env.local AFTER
 * .env, so .env.local wins, and an hour once went into editing the file that
 * was being overridden. Whichever file actually decides is the one this edits.
 *
 * Only the host is rewritten. The port and path are left exactly as they are,
 * so a non-default port survives.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const KEY = 'EXPO_PUBLIC_API_BASE_URL';
const root = path.join(__dirname, '..');

function lanAddress() {
  for (const iface of ['en0', 'en1']) {
    try {
      const addr = execSync(`ipconfig getifaddr ${iface}`, { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .trim();
      if (addr) return addr;
    } catch {
      // Interface is down or not present — try the next one.
    }
  }
  return null;
}

const local = path.join(root, '.env.local');
const target = fs.existsSync(local) ? local : path.join(root, '.env');

if (!fs.existsSync(target)) {
  console.log(`[api-url] no env file to update — skipping`);
  process.exit(0);
}

const ip = lanAddress();
if (!ip) {
  // Not a failure: no wifi, or ethernet-only. The existing value may still be
  // right, and refusing to start the dev server over this would be worse.
  console.log('[api-url] no LAN address found (wifi off?) — leaving env untouched');
  process.exit(0);
}

const before = fs.readFileSync(target, 'utf8');
const line = new RegExp(`^${KEY}=.*$`, 'm');

if (!line.test(before)) {
  console.log(`[api-url] ${KEY} not set in ${path.basename(target)} — skipping`);
  process.exit(0);
}

const current = before.match(line)[0];
const updated = current.replace(/\/\/[^:/]+/, `//${ip}`);

if (current === updated) {
  console.log(`[api-url] already ${ip}`);
  process.exit(0);
}

fs.writeFileSync(target, before.replace(line, updated));
console.log(`[api-url] ${path.basename(target)}: ${current.split('=')[1]} -> ${updated.split('=')[1]}`);
