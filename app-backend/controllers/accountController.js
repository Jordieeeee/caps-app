const Account = require('../models/Account');
const Consumer = require('../models/Consumer');
const MeterReading = require('../models/MeterReading');
const ServiceConnection = require('../models/ServiceConnection');
const httpError = require('../utils/httpError');
const ErrorCodes = require('../utils/errorCodes');
const { withPaymentSummary } = require('../utils/accountPaymentSummary');
const { barangayOf, summarise } = require('../utils/barangay');
const { displayName } = require('../utils/consumerIdentity');
const { formatAddress } = require('../utils/address');

exports.listMine = async (req, res) => {
  const accounts = await Account.findByConsumer(req.user.sub);
  res.json({ accounts: await Promise.all(accounts.map((a) => withPaymentSummary(a.toObject()))) });
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
 * When the portal adds a route assignment, filter here on `req.user.sub`'s
 * routeIds and this comment goes away.
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
 * ⚠️ PRODUCT DECISION REQUIRED. This is consistent with the decided model in the
 * meantime: consumer logins are already created by TWD office staff with no
 * self-signup, so account linking happening at the same counter is not a new
 * burden. Options for the district:
 *   1. Office-only linking (status quo here) — staff link at the counter on ID.
 *   2. In-app request → office approval queue — consumer submits, staff confirm.
 *   3. Shared-secret challenge — e.g. exact amount of a recent payment, which is
 *      NOT on the bill. Weakest of the three; still guessable for round amounts.
 */
exports.link = async (req, res) => {
  throw httpError(
    403,
    'Water accounts are linked by TWD office staff. Please visit the Tanauan City ' +
      'Water District office with a valid ID to link an account.',
    ErrorCodes.NOT_SUPPORTED
  );
};

/**
 * Unlinking stays open: it only ever removes the caller's own id from an account,
 * so the worst case is a consumer losing sight of their own bill, which they can
 * fix at the office. No one else's data is reachable through it.
 */
exports.unlink = async (req, res) => {
  const account = await Account.unlinkConsumer(req.params.accountNumber, req.user.sub);
  if (!account) throw httpError(404, 'Account not found');
  res.json({ account: await withPaymentSummary(account.toObject()) });
};
