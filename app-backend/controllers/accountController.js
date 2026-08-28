const Account = require('../models/Account');
const AccountLinkRequest = require('../models/AccountLinkRequest');
const Consumer = require('../models/Consumer');
const Feedback = require('../models/Feedback');
const MeterReading = require('../models/MeterReading');
const ServiceConnection = require('../models/ServiceConnection');
const httpError = require('../utils/httpError');
const ErrorCodes = require('../utils/errorCodes');
const { balancesByConnection } = require('../utils/accountPaymentSummary');
const { barangayOf, summarise } = require('../utils/barangay');
const { displayName } = require('../utils/consumerIdentity');
const { formatAddress } = require('../utils/address');

/**
 * GET /accounts — the caller's own water accounts.
 *
 * ⚠️ THE LINK BETWEEN A PERSON AND A METER IS `serviceconnections`, NOT
 * `Account.consumerIds`. This query used to be `Account.find({ consumerIds: sub })`
 * and it returned `[]` for every real login in the district's database — all ten
 * `consumerIds` references point at consumer documents that do not exist, leftovers
 * from this repo's own seed script (see models/Account.js). Meanwhile the portal
 * records ownership in `serviceconnections`, keyed on `accountNo`, and does so
 * correctly for every consumer it has registered.
 *
 * The visible symptom was a consumer who owns a meter being shown "Link your first
 * account" — the app asking them to establish a link the district had already made.
 * `GET /accounts/route` below was migrated to this same spine when the collector's
 * route list had the same defect; this endpoint was missed.
 *
 * Scoped to `req.user.sub` with no caller-supplied parameter, which is the property
 * that matters most here: the previous `GET /billing/:accountNumber` shape let any
 * logged-in consumer read any household's data, and account numbers are sequential
 * and printed on every bill. There is nothing to tamper with in this query.
 *
 * `accounts` is a decoration, not the spine — it supplies the rate class and the
 * on-the-books status where a matching document happens to exist. A connection with
 * no account document is still the consumer's meter and is still returned.
 */
exports.listMine = async (req, res) => {
  // Connections come from the resolved scope, not from req.user.sub. For a
  // password consumer that is exactly their own id and this behaves as it
  // always did; for a Google consumer it is the set of registry consumers
  // their ACTIVE ConsumerLinks resolve to.
  const { consumerIds } = req.consumerScope;
  const connections = consumerIds.length
    ? await ServiceConnection.find({ consumerId: { $in: consumerIds } }).lean()
    : [];
  const accountNumbers = connections.map((c) => c.accountNo).filter(Boolean);

  const accounts = await Account.find({ accountNumber: { $in: accountNumbers } }).lean();
  const accountByNumber = new Map(accounts.map((a) => [a.accountNumber, a]));

  /**
   * A balance PER CONNECTION, resolved per registry consumer.
   *
   * This was one balance for the whole response, computed from consumerIds[0]
   * and blanked whenever the caller held more than one account. That was right
   * while a caller was always a single `consumers` row — their bills genuinely
   * cannot be split per meter, and inventing a division is how somebody pays
   * the wrong amount.
   *
   * It is wrong for a Google identity holding several ConsumerLinks, which is
   * now a thing that exists. Two linked accounts owned by two different registry
   * consumers have two separately attributable balances, and the old shape
   * reported null for both — the account list telling a consumer with two houses
   * that it could not say what either owed, while each one's bills sat in the
   * database under its own consumer id.
   *
   * balancesByConnection asks the question once per consumer and still returns
   * null where it genuinely cannot answer: one consumer, several meters.
   */
  const balances = await balancesByConnection(connections);

  const rows = connections.map((connection) => {
    const account = accountByNumber.get(connection.accountNo) || null;

    return {
      // The connection, not the account: one row is one meter, and a connection
      // exists for every row here while an account document may not.
      id: String(connection._id),
      accountNumber: connection.accountNo || '',
      // The service address — where the meter is. `Consumer.mailingAddress` is where
      // the bill goes, and for a landlord or a business those are different places.
      address: formatAddress(connection.serviceAddress) || (account ? account.address : '') || '',
      type: (account ? account.type : connection.accountType) || 'residential',
      status: account ? account.status : 'active',
      /**
       * When the district connected the meter, which is the honest answer to "since
       * when is this mine". The old `Account.linkedDate` was the seed script's
       * record-creation date and is meaningless against live data.
       */
      linkedDate: connection.dateConnected ? connection.dateConnected.toISOString() : undefined,
      ...(balances.get(String(connection._id)) ?? {
        outstanding: null,
        paymentStatus: 'Unknown',
      }),
    };
  });

  rows.sort((a, b) => a.accountNumber.localeCompare(b.accountNumber));

  res.json({ accounts: rows });
};


/** Account.type → the rate class printed on the receipt. */
const RATE_CLASS = {
  residential: 'Residential',
  commercial: 'Commercial',
  government: 'Government',
};

/**
 * The most recent confirmed reading per account, in one round trip.
 *
 * `readingDate` first, `createdAt` second: two readings on the same calendar day
 * mean the meter was re-read to correct the first, and the correction is the one
 * this month's consumption must be measured from.
 */
async function lastReadingByAccount() {
  const rows = await MeterReading.aggregate([
    { $sort: { readingDate: -1, createdAt: -1 } },
    {
      $group: {
        _id: '$accountNumber',
        currentReading: { $first: '$currentReading' },
        readingDate: { $first: '$readingDate' },
      },
    },
  ]);
  return new Map(rows.map((r) => [r._id, r]));
}

/**
 * GET /accounts/route — the district's consumers, as stops, grouped by barangay.
 *
 * This is what the collector's phone pre-loads while it still has signal; from
 * there the whole reading flow runs off the cache. It replaces a twelve-row
 * fixture in the app that had been standing in for this endpoint since the module
 * was written.
 *
 * ⚠️ THE CONSUMER REGISTRY DRIVES THIS, NOT `accounts`. The query used to start
 * from `Account.find({})` and reach sideways for a name, which put four nameless
 * rows on every collector's route: the district holds ten `accounts` documents and
 * six `consumers`, and the four extra accounts are leftovers from this repo's own
 * seed script whose `consumerIds` point at consumer records that no longer exist.
 * Nothing can name them, nobody is billed for them, and a collector cannot knock
 * on a door belonging to no one. Starting from `consumers` means a stop exists
 * because a *person* exists, so every row on the route has a name by construction
 * rather than by a lookup that might miss.
 *
 * A consumer with no service connection is not a stop and is skipped — no
 * connection means no meter to read. That is a gap in the district's records
 * rather than a gap in the route, and it belongs in the portal's own reporting,
 * not silently as an unreadable row on someone's walking list. A consumer with
 * several connections is several stops, which is correct: that is several meters.
 *
 * ⚠️ NOT SCOPED TO THE CALLER'S ROUTE, because nothing in this database can scope
 * it. `Collector.routeIds` holds route identifiers and neither the consumer nor
 * the connection carries a route assignment or a walk sequence — there is no join
 * to make, so every collector receives the full list and the app filters it by
 * barangay instead. That is the honest shape of the data today and it is the
 * reason this is Collector-gated rather than open: it is the district's customer
 * list, and it goes to field staff who already carry it on paper, to nobody else.
 * When the portal adds a route assignment, filter here on the routeIds of
 * `req.collectorScope.collectorId` — NOT `req.user.sub`, which is a
 * google_users._id for an allowlisted collector and matches no employee — and
 * this comment goes away.
 *
 * `sequence` is derived — barangay, then account number — not surveyed. A real
 * walk order is a physical path through a barangay that only the district can
 * record; numbering the list keeps the paper route sheet's habit (a stop has a
 * number you can call out) without pretending the order was optimised.
 */
exports.listRoute = async (req, res) => {
  const [consumers, lastReading] = await Promise.all([
    Consumer.find({}).lean(),
    lastReadingByAccount(),
  ]);

  /**
   * `serviceconnections` is the portal's link between a person and a meter, and
   * the only one that resolves against live data — `Account.consumerIds` is this
   * repo's seed-script link and is entirely dangling in the district's database.
   * See models/ServiceConnection.js.
   */
  const connections = await ServiceConnection.find({
    consumerId: { $in: consumers.map((c) => c._id) },
  }).lean();

  // `accounts` is now a decoration, not the spine: it supplies the rate class and
  // the on-the-books status where a matching document happens to exist.
  const accounts = await Account.find({
    accountNumber: { $in: connections.map((c) => c.accountNo).filter(Boolean) },
  }).lean();
  const accountByNumber = new Map(accounts.map((a) => [a.accountNumber, a]));
  const consumerById = new Map(consumers.map((c) => [String(c._id), c]));

  const rows = connections.map((connection) => {
    const holder = consumerById.get(String(connection.consumerId)) || null;
    const account = accountByNumber.get(connection.accountNo) || null;
    const last = lastReading.get(connection.accountNo);
    const serviceAddress = connection.serviceAddress || null;

    return {
      // The connection, not the account: one row is one meter, and a connection
      // exists for every row here while an account document may not.
      id: String(connection._id),
      accountNumber: connection.accountNo || '',
      /**
       * Always a person, never a fallback to the account number.
       *
       * `displayName` composes the portal's three name shapes — a flat `name`, an
       * individual's firstName/middleName/lastName, or a business's businessName
       * with its contact person — because the registry stores all three and a
       * screen that reads only one of them shows a blank for the others. Every
       * consumer in the district's database resolves through it; the fallback
       * below is a guard against a future record with no name at all, and it says
       * so rather than printing an account number where a person belongs.
       */
      consumerName: displayName(holder) || 'Name not on file',
      /** The portal's own customer number, for looking the household up at the office. */
      consumerNo: holder && holder.consumerNo ? holder.consumerNo : null,
      // The service address, because the collector is walking to the meter, not to
      // wherever the bill is posted.
      address: formatAddress(serviceAddress) || (account ? account.address : '') || '',
      barangay: barangayOf({
        serviceAddress,
        mailingAddress: holder ? holder.mailingAddress : null,
        address: account ? account.address : '',
      }),
      /**
       * The portal's own connection state, passed through unchanged. It is not the
       * same fact as `status` below: an account can be active on the books while
       * its meter is still `pending_installation`, and that is a stop with nothing
       * to read on it.
       */
      connectionStatus: connection.status || null,
      // The `meters` collection exists in the portal and is empty, and nothing
      // else stores a meter number. Sent as an empty string rather than omitted so
      // the app renders "Not on file" instead of a blank row it cannot explain.
      meterNumber: '',
      previousReading: last ? last.currentReading : 0,
      /**
       * Null means never read through this app. The 0 above is then a starting
       * point, not a measurement, and the app must say so before billing against
       * it — a first reading of 1250 against an assumed 0 bills the consumer for
       * the entire life of the meter.
       */
      lastReadingDate: last ? last.readingDate : null,
      rateClass:
        RATE_CLASS[account ? account.type : connection.accountType] || 'Residential',
      accountType: account ? account.type : connection.accountType,
      status: account ? account.status : 'active',
    };
  });

  rows.sort(
    (a, b) =>
      a.barangay.localeCompare(b.barangay) || a.accountNumber.localeCompare(b.accountNumber)
  );
  rows.forEach((row, index) => {
    row.sequence = index + 1;
  });

  res.json({
    accounts: rows,
    barangays: summarise(rows),
    syncedAt: new Date().toISOString(),
  });
};

/**
 * Self-service linking is CLOSED, deliberately.
 *
 * What this used to do: take `accountNumber` from the request body and
 * `$addToSet` the caller onto that account, capped only at five. No check that the
 * caller had any relationship to the meter. Account numbers are sequential
 * (ACC-2026-0001 upward) and printed on every bill posted through a door, so any
 * consumer could link a stranger's account and immediately read their name,
 * address, and outstanding balance through GET /accounts. That is a full
 * enumeration of the district's customer base from one ordinary login.
 *
 * It fails closed rather than shipping a guess at verification, because every
 * cheap check is one the attacker also passes — the last bill amount, the address,
 * the meter number are all printed on the bill or visible from the street. A real
 * check needs something only the account holder has, and choosing it is the
 * district's call, not this file's.
 *
 * ✅ RESOLVED — the district chose the approval queue. `POST /accounts/link-requests`
 * above is that workflow: the consumer asks, staff verify identity at the office or
 * against their records, and staff make the link in the portal. Nothing about this
 * endpoint changed, because the answer to "attach this account right now, on the
 * caller's say-so" is still no.
 *
 * Kept rather than deleted so that an older app build still installed on someone's
 * phone gets a 403 with an explanation instead of a 404 it would report as
 * "something went wrong". Remove it once no such build is in the field.
 */
exports.link = async (req, res) => {
  throw httpError(
    403,
    'Water accounts are linked by TWD office staff. Update the app to request an ' +
      'account from your phone, or visit the Tanauan City Water District office with a valid ID.',
    ErrorCodes.NOT_SUPPORTED
  );
};

/* ------------------------------------------------------------------ *
 * Link requests — the consumer asks, the office decides.
 * ------------------------------------------------------------------ */

/** Pending requests one consumer may have open at once. */
const MAX_PENDING_REQUESTS = 5;

/**
 * Shape only — deliberately not the district's numbering rule.
 *
 * Live account numbers look like `ACC-2026-0001`, but pinning that pattern in here
 * would reject every account the district issues after it changes its scheme, and
 * the app would be the reason a consumer could not ask about their own meter. This
 * rejects what is obviously not an account number (empty, a sentence, punctuation)
 * and lets the office judge the rest — which is the whole point of the workflow.
 */
const ACCOUNT_NUMBER_SHAPE = /^[A-Z0-9][A-Z0-9-]{3,31}$/;

/**
 * One request as the consumer sees it.
 *
 * ⚠️ `decidedBy` IS NEVER SENT, and neither is any staff-written reason — this
 * response has no field for one, on purpose. "Rejected: that account belongs to
 * someone else" would confirm both that the account exists and that it is held,
 * which is exactly the fact `createLinkRequest` below refuses to disclose. A
 * rejected consumer is pointed at the office, where staff can say as much as the
 * person in front of them is entitled to hear.
 */
function presentRequest(doc) {
  return {
    id: String(doc._id),
    accountNumber: doc.accountNumber,
    note: doc.note || null,
    status: doc.status,
    submittedAt: doc.createdAt.toISOString(),
    decidedAt: doc.decidedAt ? doc.decidedAt.toISOString() : null,
  };
}

/**
 * POST /accounts/link-requests — ask TWD to add an account to this profile.
 *
 * ⚠️ THE SECURITY PROPERTY IS THAT THIS TELLS THE CALLER NOTHING. It does not look
 * the account number up. A request for `ACC-2026-0001`, for `ACC-9999-9999`, and for
 * an account belonging to a stranger all produce the identical 201 and the identical
 * body. That is what makes it safe to expose at all: account numbers are sequential
 * and printed on every bill posted through a door, so an endpoint that answered
 * "no such account" would hand over a customer-base enumeration one request at a
 * time — the exact hole that closed `POST /accounts/link` (403, below).
 *
 * Anything this *does* refuse is a fact about the caller's own profile, which they
 * can already see: that the account is theirs already, or that they have too many
 * requests open. Neither reveals anything about anyone else.
 *
 * The cost of not checking is that staff receive typos. That is the correct place
 * for the cost to land — a wrong number wastes a moment at the counter, whereas an
 * accurate "that account exists" reply is permanent and copyable.
 */
exports.createLinkRequest = async (req, res) => {
  const accountNumber = String(req.body.accountNumber).trim().toUpperCase();
  const rawNote = typeof req.body.note === 'string' ? req.body.note.trim() : '';
  const note = rawNote ? rawNote.slice(0, 500) : undefined;

  if (!ACCOUNT_NUMBER_SHAPE.test(accountNumber)) {
    throw httpError(
      400,
      'Enter the account number exactly as printed on your TWD bill, for example ACC-2026-0001.'
    );
  }

  // Already theirs — safe to say, it is their own record. Checked against the
  // portal's registry, the same source GET /accounts reads.
  const alreadyMine = await ServiceConnection.findOne({
    consumerId: req.user.sub,
    accountNo: accountNumber,
  }).lean();
  if (alreadyMine) {
    throw httpError(409, `${accountNumber} is already on your profile.`);
  }

  const pending = await AccountLinkRequest.countPending(req.user.sub);
  if (pending >= MAX_PENDING_REQUESTS) {
    throw httpError(
      409,
      `You already have ${MAX_PENDING_REQUESTS} requests waiting with TWD. Please wait for ` +
        'those to be reviewed, or visit the district office.'
    );
  }

  let request;
  try {
    request = await AccountLinkRequest.create({
      consumerId: req.user.sub,
      accountNumber,
      note,
    });
  } catch (err) {
    /**
     * The partial unique index fired: this consumer already has a pending request
     * for this account. Returning that one is the honest answer to "please ask TWD
     * about this account" — it has been asked — and it keeps a double-tap from
     * putting the same job in the queue twice.
     */
    if (err && err.code === 11000) {
      const existing = await AccountLinkRequest.findOne({
        consumerId: req.user.sub,
        accountNumber,
        status: 'pending',
      });
      if (existing) return res.status(200).json({ request: presentRequest(existing) });
    }
    throw err;
  }

  await notifyOffice(req.user.sub, accountNumber, note);

  res.status(201).json({ request: presentRequest(request) });
};

/**
 * ⚠️ BRIDGE, REMOVE WHEN THE PORTAL HAS ITS OWN QUEUE.
 *
 * `accountlinkrequests` is a new collection and the Admin Portal has no screen that
 * reads it yet. Without this, the app would tell a consumer "TWD has your request"
 * while no TWD screen anywhere would show it — a silent disappearance, which is the
 * one outcome the feedback flow was rewritten to prevent (see feedbackController).
 *
 * So the request also lands in `feedbacks`, which staff already triage today, and
 * which the consumer can already follow under Notices → Your feedback. The
 * structured record above stays the system of record; this is a copy that makes it
 * visible. Delete this function and its call the day the portal's queue ships.
 *
 * Failure here is swallowed on purpose: the request itself is already stored, and
 * throwing would tell the consumer their request failed when it did not.
 */
async function notifyOffice(consumerId, accountNumber, note) {
  try {
    await Feedback.create({
      consumerId,
      type: 'other',
      subject: `Account link request: ${accountNumber}`,
      message:
        `This consumer is asking for water account ${accountNumber} to be added to their ` +
        `app profile.${note ? `\n\nTheir note: ${note}` : ''}\n\n` +
        'Verify their identity before linking, then make the link in the Admin Portal.',
    });
  } catch {
    // Already recorded in accountlinkrequests; the copy is a convenience.
  }
}

/** GET /accounts/link-requests — the caller's own, newest first. */
exports.listLinkRequests = async (req, res) => {
  // Google consumers never create these — they link by claiming with an OTP —
  // so this is legitimately empty for them. Returning [] rather than 403 keeps
  // the Account screen from rendering an error for a section that simply does
  // not apply to that identity.
  const id = req.consumerScope?.consumerIds?.[0] ?? req.user.sub;
  const requests = id ? await AccountLinkRequest.listByConsumer(id) : [];
  res.json({ requests: requests.map(presentRequest) });
};

/**
 * DELETE /accounts/link-requests/:id — withdraw a request that is still pending.
 *
 * Ownership is part of the query rather than a check after the read: a
 * `findById` followed by an `if` is one early return away from letting a consumer
 * cancel a stranger's request, and there is no version of this query that can match
 * a row belonging to someone else. `status: 'pending'` is in there for the same
 * reason — a decided request is a record of what the office did, not the consumer's
 * to erase.
 */
exports.cancelLinkRequest = async (req, res) => {
  const request = await AccountLinkRequest.findOneAndUpdate(
    { _id: req.params.id, consumerId: req.user.sub, status: 'pending' },
    { $set: { status: 'cancelled' } },
    { new: true }
  );

  if (!request) {
    throw httpError(404, 'That request no longer exists, or TWD has already reviewed it.');
  }

  res.json({ request: presentRequest(request) });
};

/**
 * Unlinking is CLOSED too, and for a structural reason rather than a security one.
 *
 * It used to `$pull` the caller's id out of `Account.consumerIds` and return 200.
 * Now that `listMine` reads ownership from `serviceconnections` — the collection the
 * portal actually maintains — that write changes nothing anyone reads: the account
 * would come straight back on the next refresh, after the app had told the consumer
 * it was gone. A 200 that does not do what it says is worse than a refusal.
 *
 * It cannot simply be repointed at the connection either. `serviceconnections` is
 * the portal's registry and is READ-ONLY from this backend by design — the model
 * declares a narrow schema under `strict: true` specifically so this codebase cannot
 * alter it, even by accident (see models/ServiceConnection.js). Detaching a consumer
 * from a meter is a counter transaction in the district's records, not a button.
 *
 * The app now offers "This isn't my account" instead, which files feedback for the
 * office to correct. That is the honest shape: the consumer reports, the district
 * decides. See app-frontend/src/app/consumer/account/index.tsx.
 */
exports.unlink = async (req, res) => {
  throw httpError(
    403,
    'Water accounts are linked and unlinked by TWD office staff. If an account ' +
      "shown here isn't yours, report it from the app and the district will correct it.",
    ErrorCodes.NOT_SUPPORTED
  );
};
