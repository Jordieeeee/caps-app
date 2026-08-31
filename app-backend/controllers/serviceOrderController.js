const ServiceOrder = require('../models/ServiceOrder');
const Consumer = require('../models/Consumer');
const ServiceConnection = require('../models/ServiceConnection');
const { displayName } = require('../utils/consumerIdentity');
const { formatAddress } = require('../utils/address');
const { balancesByConnection } = require('../utils/accountPaymentSummary');
const { eligibilityByConnection } = require('../utils/billingEligibility');
const User = require('../models/User');

/**
 * Idempotent sync endpoint keyed on the client-generated id.
 *
 * `completedBy` is taken from the resolved scope and never from the body — the same
 * rule as meterReadingController.sync, and for a stronger reason: a disconnection is
 * the one thing this app does that a household may later dispute, and until now the
 * district's copy of it named nobody. requireCollectorScope turns either identity
 * system's token into the same collectors._id, so an order confirmed from a Google
 * session is attributable to the same employee as one confirmed from their password
 * session. The `sub` fallback is the Admin case only — the scope hands Admin a null
 * collectorId so `list` below stays unfiltered for them.
 */
exports.sync = async (req, res) => {
  /**
   * A handset may report what it DID, never who allowed it.
   *
   * `authorisedBy` is the portal's field and the only record of who approved
   * shutting off a household's water. Spreading `req.body` straight into the upsert
   * would let any authenticated collector — or a replayed queue from a tampered
   * build — name their own authoriser, which would make the field worse than absent:
   * a record that looks authorised and is not. Stripped here rather than ignored in
   * the model, so the rule sits next to the one it mirrors immediately below.
   */
  const { authorisedBy, completedBy, ...fromClient } = req.body;

  const order = await ServiceOrder.upsertFromClient({
    ...fromClient,
    completedBy: req.collectorScope.collectorId ?? req.user.sub,
  });
  res.json({ order });
};

/**
 * Staff id → the name a collector can repeat down the phone.
 *
 * An ObjectId on a disconnection card is not an authorisation anybody can check.
 * `users` is where the portal's staff live — the same collection
 * `connectionstatushistories.changedBy` points at. Read with `.lean()` because the
 * User schema in this repo declares `role` as an enum of exactly ['Admin'] while the
 * live documents carry `general_manager`; lean skips hydration, so a role this
 * backend has never heard of cannot break a route it has no business validating.
 */
async function authorisers(ids) {
  const unique = [...new Set(ids.filter(Boolean).map(String))];
  if (unique.length === 0) return new Map();

  const staff = await User.find({ _id: { $in: unique } })
    .select('name email')
    .lean()
    .catch(() => []);

  return new Map(staff.map((u) => [String(u._id), u.name || u.email || null]));
}

/**
 * Who lives at each of these accounts, in one round trip.
 *
 * The order documents carry an account number and a free-text address and nothing
 * else about the household. A collector arriving at a gate says a name out loud, so
 * the name has to come from somewhere — and the only source that resolves against
 * live data is the same one the route list is built from: `serviceconnections`
 * joined to `consumers`. See accountController.listRoute for why `Account` is not
 * the spine here either.
 */
async function identify(accountNumbers) {
  if (accountNumbers.length === 0) return new Map();

  const connections = await ServiceConnection.find({
    accountNo: { $in: accountNumbers },
  }).lean();

  const consumers = await Consumer.find({
    _id: { $in: connections.map((c) => c.consumerId).filter(Boolean) },
  }).lean();

  const consumerById = new Map(consumers.map((c) => [String(c._id), c]));

  /**
   * What the household owes, from the portal's own bills.
   *
   * ⚠️ THE COMMENT THIS REPLACES SAID `bills` AND `billings` WERE BOTH EMPTY, so no
   * figure could be attached to an order. That was true when it was written and is
   * not true now — `bills` holds live UNPAID documents from the portal's billing
   * runs. A disconnection order is supposed to be justified *by* the billing status
   * (it is the requirement in so many words), and a collector was arriving at a gate
   * to shut off water with no idea what the household owed, unable to answer the
   * only question anyone asks them there.
   *
   * `balancesByConnection` is the same resolver the consumer's own account screen
   * uses, so the collector and the household are quoted the same number. It returns
   * null rather than guessing where a consumer holds several meters and the bills
   * cannot be split between them — and the app renders the row only when a figure is
   * present, so an unattributable balance shows nothing instead of a wrong peso
   * amount on a notice somebody keeps.
   */
  const [balances, eligibility] = await Promise.all([
    balancesByConnection(connections),
    eligibilityByConnection(connections),
  ]);

  return new Map(
    connections.map((connection) => {
      const holder = consumerById.get(String(connection.consumerId)) || null;
      const balance = balances.get(String(connection._id));
      const standing = eligibility.get(String(connection._id));
      return [
        connection.accountNo,
        {
          consumerName: displayName(holder) || '',
          address: formatAddress(connection.serviceAddress),
          outstanding: balance && typeof balance.outstanding === 'number' ? balance.outstanding : null,
          settled: standing ? standing.settled : null,
          unpaidBillCount: standing ? standing.unpaidBillCount : 0,
          daysPastDue: standing ? standing.daysPastDue : 0,
        },
      ];
    })
  );
}

/**
 * Service orders, with the household attached.
 *
 * The mobile app reads this to fill its Reconnections and Disconnections lists,
 * which until now ran on five hard-coded fixtures — "Carlos Garcia, 24 Mabini
 * Street" and friends — that matched no account in the district. Confirming one
 * posted a completion for an account TWD does not have; `serviceorders` still holds
 * exactly one document, REC-001, which is how it got there.
 *
 * What is *not* invented here matters as much as what is returned. `consumerName`
 * and `address` are joined from the registry, so they are either true or plainly
 * absent. No balance is attached: `bills` and `billings` are both empty in this
 * district's database, so there is no figure to attach, and a peso amount on a
 * disconnection notice that nobody can trace to a bill is worse than no amount at
 * all. When the portal starts issuing orders with a balance, add the field to the
 * model and it will flow through — the app already renders it only when present.
 */
exports.list = async (req, res) => {
  const filter = {};
  if (req.query.accountNumber) filter.accountNumber = req.query.accountNumber;
  if (req.query.type) filter.type = req.query.type;
  if (req.query.status) filter.status = req.query.status;

  const orders = await ServiceOrder.listByFilter(filter).lean();
  const [identities, staff] = await Promise.all([
    identify([...new Set(orders.map((o) => o.accountNumber).filter(Boolean))]),
    authorisers(orders.map((o) => o.authorisedBy)),
  ]);

  res.json({
    orders: orders.map((order) => {
      const who = identities.get(order.accountNumber);
      return {
        ...order,
        // Says so rather than printing an account number where a person belongs —
        // the same rule the route list follows.
        consumerName: (who && who.consumerName) || 'Name not on file',
        // The registry's service address wins: the collector is walking to the
        // meter. The order's own line is the fallback, and it is what an order
        // raised for an account with no live connection still has.
        address: (who && who.address) || order.accountAddress || '',
        /**
         * Only on a disconnection, and only when the order does not carry its own.
         *
         * A reconnection's figure is `settledAmount` — what the consumer PAID to
         * clear the account — and this is the opposite number. Sending it on a
         * reconnection would print an outstanding balance under the word "Settled"
         * on a slip handed to someone who has just paid, which is worse than the
         * blank row it replaced. The district records no payment this backend can
         * see, so a reconnection carries a figure only when the portal supplies one.
         */
        outstandingBalance:
          order.type === 'disconnection' && order.outstandingBalance == null
            ? who && who.outstanding
            : order.outstandingBalance,
        /**
         * Whether the household qualifies, sent for BOTH kinds.
         *
         * Unlike the peso figure above, none of these can be mislabelled by the
         * wrong screen: "settled" and "two unpaid bills" mean the same thing on a
         * reconnection and a disconnection, and each flow renders the half it cares
         * about. `settled: null` is a real answer — no bills at all — and the app is
         * required to render it as such rather than as "settled".
         */
        settled: who ? who.settled : null,
        unpaidBillCount: who ? who.unpaidBillCount : 0,
        daysPastDue: who ? who.daysPastDue : 0,
        /** The staff member who approved it, resolved to a name. Null when the
            portal has not recorded one — which is every order today. */
        authorisedBy: order.authorisedBy ? staff.get(String(order.authorisedBy)) || null : null,
      };
    }),
  });
};
