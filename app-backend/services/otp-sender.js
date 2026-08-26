/**
 * SMS delivery for OTP challenges.
 *
 * This module is the ONLY place a plaintext code touches outbound delivery,
 * and it must stay that way: controllers generate the code, hash it for
 * storage, and hand the plaintext here once, in memory. It is never logged,
 * never returned in an API response, and never persisted — by anyone, in any
 * environment. A `console.log(code)` added "just to debug" would defeat the
 * entire control; don't.
 *
 * Provider: UniSMS (unismsapi.com). HTTP Basic auth where the USERNAME is the
 * secret key and the password is the empty string — that is their scheme, not
 * a mistake here. The secret lives only in UNISMS_SECRET_KEY on the server;
 * it must never reach app-frontend.
 *
 * Failure contract with the caller (consumerClaimController):
 *   - OtpDeliveryError        → gateway unreachable/rejected/timed out. The
 *     controller maps this to a distinct 502 so the client can say "we could
 *     not send the code" instead of implying the account was wrong.
 *   - anything else           → misconfiguration (unknown provider, unset
 *     secret). Propagates as a plain failure and the claim fails CLOSED with
 *     a generic 500 rather than pretending a challenge went out.
 */

const axios = require('axios');
const { normaliseMobile } = require('../utils/phone');

const UNISMS_ENDPOINT = 'https://unismsapi.com/api/sms';
const UNISMS_TIMEOUT_MS = 10_000;

/**
 * Gateway failure, safe to log and safe to map to an API response. `detail`
 * carries diagnostics for the server log ONLY — built without the request
 * body and with every six-digit run scrubbed out of anything the gateway
 * echoed back, because some providers echo request payloads verbatim in
 * error responses, and ours contains the code.
 */
class OtpDeliveryError extends Error {
  constructor(message, detail) {
    super(message);
    this.name = 'OtpDeliveryError';
    this.detail = detail;
  }
}

/** Replace any standalone six-digit run — the OTP's exact shape — before a
 * string may reach a log or an error object. Cheap insurance against a
 * provider echoing our own content back at us. */
function redactCodeShapes(text) {
  return String(text).replace(/\b\d{6}\b/g, '******');
}

/**
 * Registry numbers are stored in PH local form (09XXXXXXXXX — see
 * utils/phone.normaliseMobile), NOT E.164. UniSMS wants +63…. Normalisation
 * happens HERE rather than trusting the caller: this module owns the wire
 * format, so a future caller passing raw registry data cannot ship a
 * malformed recipient to the gateway.
 */
function toE164(phoneNumber) {
  const local = normaliseMobile(phoneNumber);
  if (!local) return null;
  return `+63${local.slice(1)}`;
}

async function sendViaUniSMS(recipient, content) {
  const secretKey = process.env.UNISMS_SECRET_KEY;
  if (!secretKey) {
    // Misconfiguration, not a delivery failure: fail closed via the generic
    // path (plain Error → 500), never as a "gateway down" 502.
    throw new Error('UNISMS_SECRET_KEY is not set — cannot deliver OTP.');
  }

  // REQUIRED by UniSMS on every message — omitting it is a hard rejection,
  // not a default-sender fallback. It must also be a sender ID REGISTERED to
  // this account (they issue them against business documents; GET /api/account
  // reports how many you hold as `sid_tokens`). A key with sid_tokens: 0
  // cannot send at all, however correct this code is.
  //
  // Missing config fails closed as a 500 like the secret above: a 502 would
  // tell the consumer "try again in a few minutes", which is a lie when the
  // cause is a server that was never finished being configured.
  const senderId = process.env.UNISMS_SENDER_ID;
  if (!senderId) {
    throw new Error('UNISMS_SENDER_ID is not set — cannot deliver OTP.');
  }

  try {
    const response = await axios.post(
      UNISMS_ENDPOINT,
      // Request body deliberately excluded from every log line below.
      { recipient, content, sender_id: senderId },
      {
        timeout: UNISMS_TIMEOUT_MS,
        // UniSMS auth scheme: secret as the Basic username, empty password.
        auth: { username: secretKey, password: '' },
      }
    );

    // UniSMS answers 201 with { message: { status, fail_reason, ... } }.
    //
    // Statuses are checked as a DENYLIST, not an allowlist. The first cut here
    // accepted only 'sent'/'queued' and rejected everything else — which broke
    // on 'pending', UniSMS's normal accepted-and-moderating state, turning
    // every successful send into a spurious 502. We do not know their full
    // status vocabulary and cannot enumerate it safely, so only states we
    // KNOW mean failure are treated as failure.
    //
    // Consequence worth understanding: content moderation happens
    // ASYNCHRONOUSLY, after this call returns. A message accepted here can
    // still be refused minutes later (that is what the dashboard's "Failed /
    // Unacceptable content" entries are), and this code cannot see that. The
    // authoritative record of delivery is the UniSMS dashboard or a delivery
    // webhook — not this response.
    const message = response.data?.message;
    const REJECTED = new Set(['failed', 'rejected', 'undelivered', 'error']);
    if (message && REJECTED.has(String(message.status).toLowerCase())) {
      throw new OtpDeliveryError(
        'SMS gateway did not accept the message.',
        `status=${redactCodeShapes(message.status)} reason=${redactCodeShapes(message.fail_reason ?? 'none')}`
      );
    }

    return response.status;
  } catch (error) {
    // Our own in-band rejection above travels through this catch untouched —
    // re-wrapping it would replace a precise reason with a generic one.
    if (error instanceof OtpDeliveryError) throw error;
    if (axios.isAxiosError(error)) {
      if (error.response) {
        // Gateway answered with an error status. Log status + a REDACTED
        // body excerpt; never the payload we sent.
        const bodyExcerpt = redactCodeShapes(
          typeof error.response.data === 'string'
            ? error.response.data.slice(0, 300)
            : JSON.stringify(error.response.data).slice(0, 300)
        );
        throw new OtpDeliveryError(
          'SMS gateway rejected the message.',
          `status=${error.response.status} body=${bodyExcerpt}`
        );
      }
      if (error.request) {
        // Sent but no answer in time — timeout or dead route.
        throw new OtpDeliveryError(
          'SMS gateway did not respond in time.',
          `code=${error.code || 'UNKNOWN'} timeoutMs=${UNISMS_TIMEOUT_MS}`
        );
      }
    }
    // Axios setup error or something unexpected entirely.
    throw new OtpDeliveryError(
      'SMS delivery failed unexpectedly.',
      redactCodeShapes(error instanceof Error ? error.message : String(error))
    );
  }
}

const PROVIDERS = {
  /** Explicitly unconfigured — kept as a named branch so an unset env var
   * reads as a decision, not a crash in dispatch. */
  none: async () => {
    throw new Error('SMS_PROVIDER is not configured — cannot deliver OTP.');
  },

  unisms: async (phoneNumber, code) => {
    const recipient = toE164(phoneNumber);
    if (!recipient) {
      // A registry number too malformed to rescue. Delivery-failure shaped:
      // the account exists but its contact data cannot be used, which is
      // operationally closer to "could not send" than to a server bug.
      throw new OtpDeliveryError(
        'Mobile number on file is not a valid PH mobile number.',
        'toE164 rejected recipient'
      );
    }
    // DO NOT "clean up" the doubled TWD below. UniSMS's content filter
    // moderates asynchronously and rejected both of the natural phrasings:
    //
    //   "Your TWD verification code is {code}"                  -> Failed
    //   "Your TWD verification code for account access is …"     -> Failed
    //   "Your TWD verification code for TWD account access is …" -> Sent
    //
    // Verified empirically against the live gateway (four wordings carrying
    // "TWD account access" all passed; every wording without it failed). The
    // filter appears to want the brand adjacent to "account access", and
    // reads a single leading "TWD" as insufficient. It reads redundantly to a
    // human, and that is the price of delivery.
    const content =
      `Your TWD verification code for TWD account access is ${code}. ` +
      'Valid for 5 minutes. Do not share this code.';
    await sendViaUniSMS(recipient, content);
  },
};

/**
 * @param {string} phoneNumber Registry-form mobile (09XXXXXXXXX expected;
 *   normalised to E.164 internally).
 * @param {string} code        Six-digit plaintext. In-memory use ONLY.
 */
async function sendOtp(phoneNumber, code) {
  const providerName = process.env.SMS_PROVIDER || 'none';
  const provider = PROVIDERS[providerName];
  if (!provider) {
    throw new Error(`Unknown SMS_PROVIDER "${providerName}".`);
  }
  await provider(phoneNumber, code);
}

module.exports = { sendOtp, OtpDeliveryError };
