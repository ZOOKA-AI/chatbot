# UAE paid launch: billing architecture (feature branch, not active)

Branch `feat/uae-billing`, cut from `release/rc-1` at `d99b562`. Nothing here is wired into a
route, no flag is on, and no payment provider call exists yet. The point of this branch is
that the money rules are testable before any customer is ever charged.

## The commercial model, all provisional

| Item | Value | Where it lives |
| --- | --- | --- |
| Plan | one paid starter, no free tier | `FREE_PLAN_ENABLED = false` |
| Price | 49.00 AED / month (4,900 fils) | `STARTER_PLAN.priceMinor`, env `STARTER_PRICE_MINOR` |
| Included usage | 20.00 AED of credit (2,000 fils) | `STARTER_PLAN.includedCreditMinor` |
| Currency | AED | `CURRENCY` |

Every number is read from `lib/billing/config.ts` and none is typed into a component, so
changing the price is one edit rather than a hunt through screenshots and copy. Money is
always an integer number of fils; there is no float in this path.

## The loop, in the order the owner specified

`authorizeExecution()` implements steps 1-4 and returns a decision; `finishExecution()`
implements 6-8.

1. **Subscription** - read from `BillingAccount`; an account without an active row is
   refused. There is no code path that grants execution to an unsubscribed user.
2. **Estimate** - `estimateCostMinor(metric, units)` from a rate table. An unpriced metric
   returns `null` and the execution is refused. Unknown cost is a refusal, never a free run.
3. **Balance** - the check and the reservation are the same statement, so there is no window
   between them.
4. **Reserve atomically** - one SQL statement: compute the balance, insert the reservation
   only if it covers the estimate, and post the negative hold row in the same CTE.
5. **Execute** - unchanged application code.
6. **Settle** - release the hold, post the real charge. The status transition
   `held -> settled` is the lock, so a second call finds nothing to update.
7. **Release** - the unused remainder is already returned by step 6; a failed execution
   calls `releaseReservation()` instead and returns the whole hold.
8. **Audit** - every one of the above is a `CreditLedger` row. Balance is `SUM()`, never a
   stored number, so the ledger and the balance cannot disagree.

## What the schema makes structurally impossible

| Risk | Why it cannot happen |
| --- | --- |
| Negative balance | the hold is inserted only when the balance covers it, and settlement is capped at the hold |
| Double charge | settlement updates `status = 'held'`, which succeeds once |
| Duplicate transaction | `CreditReservation (organizationId, ref)` and `PaymentTransaction (provider, providerRef)` are unique |
| Cross-tenant billing | every statement filters `organizationId`, and settlement verifies the reservation belongs to the caller |
| Unmetered paid execution | an unpriced metric is refused, and the guard is the only entry point |
| Overdraft | `ALLOW_OVERDRAFT = false`; no request body can raise it |
| Stranded holds | `RESERVATION_TTL_SECONDS` plus `sweepExpiredReservations()` releases a dead worker's hold |
| Ledger tampering | the runtime role is granted SELECT/INSERT on `CreditLedger` and explicitly denied UPDATE/DELETE |

## Tests, against real PostgreSQL

`tests/unit/billing-ledger.test.ts`, 18 tests, PGlite, applying the real migration:
included credit as a ledger row, hold and reduced balance, settle with the remainder
returned, a second settlement refused with the balance unmoved, an over-balance request
refused with no reservation row written, actual usage above the hold capped so the balance
stays positive, exact release, expiry sweep that touches only the expired hold, one tenant
unable to settle or release another's reservation, per-month usage counters, subscription
status read rather than assumed, and the guard's five outcomes including the full loop
charging 45 fils on a 60 fil hold and charging nothing on a second close.

## Deliberately not done

- No payment provider is configured. `PaymentTransaction` exists to record what a provider
  reports; nothing calls one, and no card is touched.
- `BILLING_ENFORCEMENT_ENABLED` is unset, so `authorizeExecution` prices work and returns
  `will not be charged`. Turning it on is a separate, explicit step.
- No UI. The design rule stands: nothing is shown to a customer until it is real.
- No production migration. `0050_billing_ledger.sql` is pending like the rest.

## Before this can charge anyone

1. Owner approves the price and the included credit, or changes them.
2. A provider is chosen and authorized (the platform has a payments integration path; no
   keys have been added).
3. Webhook verification: `PaymentTransaction.providerRef` uniqueness is ready for it, but
   signature checking is not written.
4. `0050` applied with the rest of the ladder, then `BILLING_ENFORCEMENT_ENABLED=true`.
5. A customer-facing estimate and a top-up path, built against the real numbers.
