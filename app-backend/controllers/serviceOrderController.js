const ServiceOrder = require('../models/ServiceOrder');
const Consumer = require('../models/Consumer');
const ServiceConnection = require('../models/ServiceConnection');
const { displayName } = require('../utils/consumerIdentity');
const { formatAddress } = require('../utils/address');

// Idempotent sync endpoint keyed on the client-generated id.
exports.sync = async (req, res) => {
  const order = await ServiceOrder.upsertFromClient(req.body);
  res.json({ order });
};

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

  return new Map(
    connections.map((connection) => {
      const holder = consumerById.get(String(connection.consumerId)) || null;
      return [
        connection.accountNo,
        {
          consumerName: displayName(holder) || '',
          address: formatAddress(connection.serviceAddress),
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
  const identities = await identify(
    [...new Set(orders.map((o) => o.accountNumber).filter(Boolean))]
  );

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
      };
    }),
  });
};
