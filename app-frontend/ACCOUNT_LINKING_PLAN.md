# Linking a Second Meter

**Design note — Consumer side. Drafted 28 Aug 2026.**

A consumer with two houses has two water accounts and two bills, but one login. The
plumbing for this is almost entirely built already — one role gate is what stands
between you and the feature.

> Findings in sections 1 and 2 were reproduced live against `app-backend` on
> `localhost:5001` and the working tree at the time of writing. The phase breakdown
> is a scope sketch, not a schedule.

---

## 1. Where it stands today

A Google consumer cannot add a second account by any route. Both doors return 403:

```
POST /accounts/link-requests  ->  403  Insufficient permissions
POST /consumer/claim-account  ->  403  You do not have access to this.
```

They fail for *different* reasons, and the difference is the whole story:

- **Link requests** sit below `router.use(auth, requireRole('Consumer'))` in
  `accountRoutes.js` — password consumers only. The model underneath,
  `AccountLinkRequest.consumerId`, references the `Consumer` collection, so it
  cannot even describe a Google requester.
- **The OTP claim** is gated `requireGoogleRoles('unclaimed')`. A consumer who has
  already claimed their first house has role `consumer`, so the flow that would link
  their second house now refuses them.

---

## 2. The claim flow already *is* account linking

> Everything "link a second account" needs, `verifyClaim` already does — correctly,
> and with proof of ownership.

It texts a code to the mobile number the registry holds *for that specific account*,
and on success writes a `ConsumerLink` row. That row is what `models/ConsumerLink.js`
calls "the sole path every consumer-facing billing endpoint must consult." Linking a
house *is* minting one of those rows.

So this isn't a feature to design from scratch. It's a gate to open, plus the
guardrails that opening it requires.

### What already works when a user holds more than one account

| Status | Layer | Where |
| --- | --- | --- |
| Works | One user, many accounts — the partial unique index is on `accountNumber` alone, not the pair, so it stops two people holding one meter without limiting how many meters one person holds | `models/ConsumerLink.js` |
| Works | Authorization resolves a *list* — `accountNumbers` plus a deduped `consumerIds`, built from every active link | `middleware/consumer-scope.js` |
| Works | Billing reads the plural — `Billing.listForConsumers(req.consumerScope.consumerIds)` | `controllers/billingController.js:84` |
| Works | The consumer home already branches on `accounts.length` and renders a list | `app/consumer/index.tsx` |
| Works | Re-claiming can't corrupt the role — promotion is a guarded write that only moves `unclaimed -> consumer` and no-ops for anyone already claimed | `consumerClaimController.js:303` |
| **Gap** | The claim endpoints refuse a claimed consumer | `routes/consumerRoutes.js` |
| **Gap** | The claim *screens* refuse too — the shell hard-redirects anyone whose role isn't `unclaimed` | `app/claim/_layout.tsx:16` |
| **Gap** | No cap on how many accounts one identity may hold. `types/auth.ts` already promises "a server-enforced cap" that does not exist | nowhere |
| **Gap** | Bills from two houses arrive in one undifferentiated list — neither the bills screen nor the home screen mentions `accountNumber` anywhere | `app/consumer/bills/index.tsx` |
| **Gap** | No entry point. Nothing in the consumer UI offers "add another account" | `app/consumer/account/` |

Five of ten already work. The plan is the other five.

---

## 3. The build, in order

The order is load-bearing — each phase is testable before the next begins.

### Phase 1 — Open the gate, add the guardrails (backend only)

Do this alone first. It is fully testable with the smoke scripts before a single
screen changes, and it is where every security decision lives.

- In `consumerRoutes.js`, widen both endpoints to
  `requireGoogleRoles('unclaimed', 'consumer')`.
- In `claimAccount`, reject early when the account already has an active link. The
  partial unique index already makes a double-claim impossible, but a caller deserves
  a clean `ALREADY_CLAIMED` rather than a duplicate-key 500 after they've burned an OTP.
- Add `MAX_LINKED_ACCOUNTS` and enforce it in `claimAccount`, counting active links
  for the caller. This is the cap `types/auth.ts` already claims exists.
- Leave `verifyClaim`'s role promotion exactly as it is. It is already guarded to
  `unclaimed`, which is precisely the behaviour a second claim needs.

### Phase 2 — Let the screens be reached twice (frontend routing)

The two claim screens are already the right screens. They just can't be opened by
someone who has claimed before, and their copy assumes a first run.

- Widen `claim/_layout.tsx` to admit `consumer` as well as `unclaimed`.
- Pass a mode so the copy adapts: "Verify your account" for a first claim, "Add
  another account" for a second. Same fields, same OTP, different framing.
- On success, branch on where the user came from. A first claim swaps the session
  role and enters the app; a second returns to the account list with the new house
  showing.
- Add the entry point: an **Add another account** button in the consumer account area.

### Phase 3 — Make two houses legible (frontend, the real design work)

This is the part that is genuinely new, and the part most likely to be
underestimated. A second account changes what every consumer screen means.

- **Every bill must name its house.** Today nothing does. Two houses' bills
  interleaved with no label is worse than not having the feature — someone pays the
  wrong one.
- Decide what the home screen totals mean. One balance across both houses, or a
  figure per house? A single merged number reads fine in a demo and causes a real
  payment error.
- Give each account a name people recognise. An account number is not how anyone
  thinks about their own house.
- Check the notices and feedback screens — anything that assumed one account now has
  to say which.

---

## 4. Why OTP is the right gate

Account numbers are sequential and printed on every bill posted through a door.
`accountController.js` says this outright, and it is the reason the office-approval
path exists for password consumers: no check the backend can apply to a typed account
number is a check an attacker fails.

The OTP is different in kind. It doesn't check the number — it proves the caller
controls the mobile number *the registry already holds for that account*. A person
with two houses passes it twice because they own both phones on file. Someone
guessing at `ACC-2026-0009` passes it never.

The protections around it carry over unchanged: five failed attempts per account per
hour, single-use codes consumed atomically, five-minute expiry, and every attempt
logged to `ClaimAttempt` whether it succeeded or not.

### One case the OTP cannot serve

If the second account has no verified mobile in the registry, `claimAccount` returns
`NO_MOBILE_ON_FILE` and there is no self-service path at all. That consumer must visit
the office. Worth deciding now whether that message tells them so plainly, because it
will happen and the app currently has nothing to say about it.

---

## 5. What not to build

Do **not** wire `AccountLinkRequest` up for Google consumers. It looks like the
account-linking feature — it is even named for it — and it is a trap for two
independent reasons:

- Its `consumerId` references the password `Consumer` collection. A Google identity
  has no row there, so the model cannot represent the requester without being
  rewritten.
- More fundamentally, its own header says *"a request is a message, not a link."*
  Approving one grants nothing — staff make the actual connection in the portal's
  `serviceconnections`, which is what `GET /accounts` reads for *password* consumers.
  Google consumers are authorized through `ConsumerLink` instead, which that approval
  never touches. The office would approve a request that changes nothing.

It stays exactly as it is: the password consumers' path, untouched. Keep it as the
escape hatch for the `NO_MOBILE_ON_FILE` case if you later want one, but that is a
separate decision and a separate build.

---

## 6. Decisions only you can make

These change what gets built. Worth settling before Phase 1.

### How many accounts may one person hold?

The cap has to exist before the gate opens, or the first version ships without one.
The neighbouring limit for reference: pending link requests are capped at five
(`MAX_PENDING_REQUESTS`).

**Recommendation: five**, matching that precedent. Two houses is the real case; five
leaves room for a family without turning one login into a landlord's portal.

### Can a consumer unlink a house themselves?

Right now they cannot — unlink is admin-only, deliberately, because `ConsumerLink` is
an audit trail of who could see whose bills. But someone who links the wrong account
has no way to undo it.

**Recommendation: keep it admin-only for now.** A wrong link needs an OTP the person
doesn't have, so it is a rare mistake — and self-unlink means designing the re-claim
path too.

### One balance, or one per house?

This is Phase 3's central question and it is a billing-correctness decision, not a
layout one. A merged total is tidier and can cause someone to pay one house's bill
believing they've cleared both.

**Recommendation: per house, always.** Show a combined figure only if it is labelled
as a combined figure.

### What do you call them on screen?

"Account" is what the system calls them. "House" is what the consumer calls them, but
it is wrong for a business or a second meter on one lot.

**Recommendation: let them name it** — a nickname on the link, with the service
address as the default. That is also what makes the bills list readable in Phase 3.
