const Consumer = require('../models/Consumer');
const AppCredential = require('../models/AppCredential');
const httpError = require('../utils/httpError');
const { displayName, primaryContact } = require('../utils/consumerIdentity');

/**
 * The consumer's own registry record — read here, editable only in part.
 *
 * The `consumers` collection is the Admin Portal's customer registry, not this
 * backend's table. Everything in it is shown to the person it describes, because
 * a consumer being unable to see what the district holds about them is its own
 * problem — a wrong barangay on file is why a bill never arrives, and today the
 * only way to discover that is to be told at the counter.
 *
 * Editing is a much narrower hole, and it is narrow in two independent places:
 *
 *   1. Here — `update` reads exactly two fields off the body and ignores the rest.
 *   2. In the schema — Consumer.js declares only `contacts` and `mailingAddress`
 *      out of the portal's registry fields, and mongoose's `strict: true` makes an
 *      undeclared path unwritable at the driver level.
 *
 * Two layers because the first one is a habit and the second one is a mechanism.
 * See the long comment on those fields in models/Consumer.js for why the identity
 * and entitlement fields specifically must stay office-only.
 */

/** Portal `contacts` entries this backend will treat as the editable phone slot. */
const MOBILE = 'mobile';

/**
 * Philippine mobile numbers, normalised to the 09XXXXXXXXX form already in the
 * registry.
 *
 * Accepts the +63 form too, because that is what a phone's own contact card
 * produces and rejecting it would look like the app disliking the user's real
 * number. Spaces, dashes and parentheses are stripped before matching rather than
 * rejected — a consumer typing `0912 345 6789` has not made a mistake.
 */
function normaliseMobile(raw) {
  const digits = String(raw).replace(/[\s()-]/g, '');

  if (/^09\d{9}$/.test(digits)) return digits;
  if (/^\+639\d{9}$/.test(digits)) return `0${digits.slice(3)}`;
  if (/^639\d{9}$/.test(digits)) return `0${digits.slice(2)}`;

  return null;
}

/** Address parts that must be present for the district to actually deliver a bill. */
const REQUIRED_ADDRESS_PARTS = ['houseStreet', 'barangay', 'city', 'province'];
const ADDRESS_PARTS = [...REQUIRED_ADDRESS_PARTS, 'zip'];

function present(raw, email) {
  const contact = primaryContact(raw.contacts);

  return {
    // Identity — display only. See models/Consumer.js.
    consumerNo: raw.consumerNo ?? null,
    consumerType: raw.consumerType ?? null,
    name: displayName(raw) ?? null,
    firstName: raw.firstName ?? null,
    middleName: raw.middleName ?? null,
    lastName: raw.lastName ?? null,
    businessName: raw.businessName ?? null,
    contactPersonName: raw.contactPersonName ?? null,
    birthDate: raw.birthDate ? new Date(raw.birthDate).toISOString() : null,
    validId: raw.validId
      ? { idType: raw.validId.idType ?? null, idNumber: raw.validId.idNumber || null }
      : null,
    isSeniorCitizen: raw.isSeniorCitizen ?? false,

    // The login email lives on the credential, never on the registry record.
    email: email ?? raw.email ?? null,

    // Editable.
    contactNumber: contact ? contact.value : null,
    mailingAddress: raw.mailingAddress
      ? ADDRESS_PARTS.reduce((out, part) => {
          out[part] = raw.mailingAddress[part] ?? null;
          return out;
        }, {})
      : null,

    accountNumbers: raw.accountNumbers ?? [],
    memberSince: raw.createdAt ? new Date(raw.createdAt).toISOString() : null,
  };
}

async function loadSelf(req) {
  const consumer = await Consumer.findById(req.user.sub);
  if (!consumer) throw httpError(404, 'Your profile could not be found.');
  return consumer;
}

async function emailFor(consumer) {
  if (consumer.email) return consumer.email;
  const cred = await AppCredential.findByProfile(consumer.id);
  return cred ? cred.email : null;
}

exports.get = async (req, res) => {
  const consumer = await loadSelf(req);
  res.json({ profile: present(consumer.toObject(), await emailFor(consumer)) });
};

/**
 * Update the two self-service fields.
 *
 * Absent keys mean "leave alone", so the client can send one field without having
 * to round-trip the other and risk writing back a stale copy of it.
 *
 * A supplied `mailingAddress` must be complete apart from `zip`. Partial merging
 * was the alternative and it is worse: a client that omits `barangay` would be
 * indistinguishable from one clearing it, and the failure mode of guessing wrong
 * is a bill delivered to the wrong street.
 */
exports.update = async (req, res) => {
  const { contactNumber, mailingAddress } = req.body;

  if (contactNumber === undefined && mailingAddress === undefined) {
    throw httpError(400, 'Send a contact number or a mailing address to update.');
  }

  const consumer = await loadSelf(req);
  const $set = {};

  if (contactNumber !== undefined) {
    const normalised = normaliseMobile(contactNumber);
    if (!normalised) {
      throw httpError(
        400,
        'Enter a valid Philippine mobile number, for example 09171234567.'
      );
    }

    const contacts = (consumer.contacts || []).map((c) => ({
      contactType: c.contactType,
      value: c.value,
      isPrimary: c.isPrimary,
    }));
    const target = contacts.findIndex(
      (c) => c.isPrimary || c.contactType === MOBILE
    );

    if (target === -1) {
      contacts.push({ contactType: MOBILE, value: normalised, isPrimary: true });
    } else {
      contacts[target] = { ...contacts[target], value: normalised };
    }

    $set.contacts = contacts;
  }

  if (mailingAddress !== undefined) {
    if (typeof mailingAddress !== 'object' || mailingAddress === null) {
      throw httpError(400, 'Mailing address must be an object.');
    }

    const next = {};
    for (const part of ADDRESS_PARTS) {
      next[part] = typeof mailingAddress[part] === 'string' ? mailingAddress[part].trim() : '';
    }

    const missing = REQUIRED_ADDRESS_PARTS.filter((part) => !next[part]);
    if (missing.length) {
      throw httpError(400, `Your mailing address needs ${missing.join(', ')}.`);
    }

    $set.mailingAddress = next;
  }

  /**
   * A targeted `$set`, never `consumer.save()`.
   *
   * `save()` validates the whole document, and this schema marks `name`, `email`,
   * `passwordHash`, `address` and `type` required — none of which a portal-created
   * consumer has, because the portal writes `firstName`/`lastName`/`mailingAddress`
   * instead. Saving one therefore fails with five validation errors about fields
   * the consumer was never asked for and cannot supply. `updateOne` validates only
   * the paths actually being written, which is also the honest scope: this request
   * changes a phone number, so a phone number is what should have to be valid.
   *
   * `strict` still applies to updates, so the schema-level guarantee described at
   * the top of this file survives here — an undeclared path in `$set` is dropped
   * before the query is sent, not merely ignored by the code above.
   */
  const updated = await Consumer.findByIdAndUpdate(
    consumer.id,
    { $set },
    { new: true, runValidators: true }
  );

  res.json({ profile: present(updated.toObject(), await emailFor(updated)) });
};
