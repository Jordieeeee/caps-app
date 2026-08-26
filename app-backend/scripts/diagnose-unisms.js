/**
 * UniSMS isolation test.
 *
 *   node scripts/diagnose-unisms.js                  # account check only, FREE, sends nothing
 *   node scripts/diagnose-unisms.js +639XXXXXXXXX    # also sends ONE real SMS (costs 1 credit)
 *
 * The account check alone answers most questions: whether the key is valid,
 * whether the account is active, whether any credits remain, and — the one
 * that actually bit us — whether a sender ID is registered (`sid_tokens`).
 * UniSMS requires sender_id on every message; an account holding zero of them
 * cannot send at all, no matter how correct the calling code is.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const axios = require('axios');
const { normaliseMobile } = require('../utils/phone');

const BASE = 'https://unismsapi.com/api';
const secretKey = process.env.UNISMS_SECRET_KEY;
const senderId = process.env.UNISMS_SENDER_ID;

if (!secretKey) {
  console.error('UNISMS_SECRET_KEY is not set in app-backend/.env');
  process.exit(1);
}
const auth = { username: secretKey, password: '' };

(async () => {
  console.log(`SMS_PROVIDER     = ${process.env.SMS_PROVIDER || '(unset)'}`);
  console.log(`UNISMS_SENDER_ID = ${senderId || '(UNSET — sends will be rejected)'}`);
  console.log(`secret key       = ${secretKey.slice(0, 4)}…${secretKey.slice(-2)}\n`);

  // ---- 1. Account check. Free, sends nothing. ----
  const acct = await axios.get(`${BASE}/account`, {
    auth, timeout: 10_000, validateStatus: () => true,
  });
  console.log('GET /account ->', acct.status, JSON.stringify(acct.data));
  if (acct.status !== 200) {
    console.error('\n=> Credentials rejected. Nothing else can work until this does.');
    return;
  }
  const { sms_credits: credits, sid_tokens: sids, status } = acct.data ?? {};
  if (status !== 'active') console.warn(`\n!! Account status is "${status}", not "active".`);
  if (!sids) {
    console.warn(
      '\n!! sid_tokens = 0 — NO REGISTERED SENDER ID.\n' +
      '   sender_id is required on every message, so every send is rejected.\n' +
      '   Register one with UniSMS (business documents required), then put it\n' +
      '   in app-backend/.env as UNISMS_SENDER_ID.'
    );
  }
  if (!credits) console.warn('\n!! sms_credits = 0 — out of credits.');

  // ---- 2. Optional real send. ----
  const raw = process.argv[2];
  if (!raw) {
    console.log('\n(no recipient given — stopping before sending anything)');
    return;
  }
  const local = normaliseMobile(raw);
  if (!local) {
    console.error(`\n"${raw}" is not a PH mobile utils/phone.js can normalise.`);
    return;
  }
  const recipient = `+63${local.slice(1)}`;
  console.log(`\nSending to ${recipient} (1 credit)…`);

  const res = await axios.post(
    `${BASE}/sms`,
    // Deliberately not OTP-shaped: nothing here should look like a real code.
    // Still needs UniSMS's preferred phrasing (company name stated plainly) or
    // this gets a content-policy rejection that looks like a fresh gateway
    // problem — see the same fix in services/otp-sender.js.
    { recipient, content: 'TWD account verification test message. No action needed.', sender_id: senderId },
    { auth, timeout: 10_000, validateStatus: () => true }
  );
  console.log('POST /sms ->', res.status, JSON.stringify(res.data, null, 2));
  console.log(
    res.status === 201
      ? '\n=> Accepted. Check message.status / message.fail_reason above, then the handset.'
      : '\n=> Rejected. This is the exact 502 the claim endpoint surfaces.'
  );
})().catch((e) => {
  console.error('Request failed:', e.code || '', e.message);
  process.exit(1);
});
