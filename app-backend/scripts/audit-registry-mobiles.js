/**
 * READ-ONLY audit: what format are consumers.contacts[].value actually in?
 *
 * The claim flow assumes the registry holds PH mobiles that utils/phone.js
 * normaliseMobile() can rescue (09XXXXXXXXX, +639XXXXXXXXX, 639XXXXXXXXX).
 * Anything it cannot rescue produces a 400 "no mobile number on file" for a
 * consumer whose number is sitting right there — so the number that matters
 * is the UNRESCUABLE bucket.
 *
 * Writes nothing. Prints no full numbers — samples are masked.
 *
 *   node scripts/audit-registry-mobiles.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const { normaliseMobile } = require('../utils/phone');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const consumers = mongoose.connection.collection('consumers');

  const counts = { noContacts: 0, noMobileEntry: 0, rescuable: 0, unrescuable: 0 };
  const byShape = new Map();
  const unrescuableSamples = [];

  const cursor = consumers.find({}, { projection: { contacts: 1 } });
  for await (const doc of cursor) {
    const contacts = Array.isArray(doc.contacts) ? doc.contacts : [];
    if (contacts.length === 0) { counts.noContacts += 1; continue; }

    // Same selection the controller uses: primary mobile, then any mobile.
    const entry =
      contacts.find((c) => c && c.contactType === 'mobile' && c.isPrimary && c.value) ||
      contacts.find((c) => c && c.contactType === 'mobile' && c.value);
    if (!entry) { counts.noMobileEntry += 1; continue; }

    const raw = String(entry.value);
    if (normaliseMobile(raw)) {
      counts.rescuable += 1;
    } else {
      counts.unrescuable += 1;
      // Shape, not content: digits -> 9, letters -> A. Safe to print.
      const shape = raw.replace(/\d/g, '9').replace(/[A-Za-z]/g, 'A');
      byShape.set(shape, (byShape.get(shape) || 0) + 1);
      if (unrescuableSamples.length < 15) {
        unrescuableSamples.push(raw.replace(/\d(?=\d{2})/g, '*'));
      }
    }
  }

  console.log('\n--- consumers.contacts[] mobile audit ---');
  console.table(counts);
  if (counts.unrescuable > 0) {
    console.log('\nUnrescuable shapes (9 = digit, A = letter), most common first:');
    console.table(
      [...byShape.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)
        .map(([shape, n]) => ({ shape, n }))
    );
    console.log('\nMasked samples:', unrescuableSamples);
    console.log(
      `\n=> ${counts.unrescuable} consumer(s) would get "no mobile number on file" ` +
      'from /consumer/claim-account even though a number exists on their record.'
    );
  } else {
    console.log('\n=> Every mobile on file normalises cleanly. Assumption holds.');
  }

  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
