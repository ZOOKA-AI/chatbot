# Billing and connector release gates

This patch is not evidence that production payments, wallets, or provider accounts
are operational. Run acceptance tests in an isolated environment before release.
Never copy production credentials or customer records into tests or a listing.

## Before deploying

- Review historical wallet/grant records if both database URL variables were set.
  Wallets now prefer `DATABASE_URL`, matching the app. Do not automatically copy
  balances or replay grants across databases; reconcile ownership and periods.
- Confirm database permissions and schema preparation. The existing wallet module
  creates its tables on demand; no database was changed by these local tests.
- Enable `invoice.paid` alongside the subscription events documented in README.
- Review callers of reconciliation: GET is read-only/405, and POST now requires a
  regular workspace owner/admin and a same-origin Origin header. It is not a cron.
- Confirm supported invoice policy: one configured non-proration recurring line,
  positive payment, and invoice-line price/period. Ambiguous or incomplete line
  lists fail closed for operator review. Zero-paid or proration-only invoices do
  not replenish credits. Same-period plan changes do not create another allowance.
- Reconciliation processes at most 100 recent paid invoices for the stored
  workspace customer and reports `hasMore`; older history is not silently claimed
  as reconciled.

## Payment acceptance tests

Use Stripe test mode and an isolated database. Verify the actual wallet and grant
ledger after each case, not just the HTTP response.

1. Subscription checkout and first paid invoice grant the intended allowance.
2. Monthly renewal replaces, rather than accumulates, the allowance.
3. Replaying an invoice or concurrently delivering it does not grant twice.
4. A delayed older invoice cannot replace a newer wallet; a different invoice for
   the same billing period cannot replenish an already-used balance.
5. Database/grant failure returns 500; redelivery succeeds once the problem clears.
6. Bad/missing signatures, wrong customer/workspace, unknown prices, and partial
   invoice line lists cannot grant silently.
7. Unauthenticated/member/cross-origin reconciliation cannot mutate balances, and
   an authorized workspace cannot reconcile another workspace's subscription.
8. Cancellation, failed payment, trial/discount, proration and plan changes match
   the documented business policy. Resolve any policy mismatch before launch.

Local regression tests mock Stripe API calls and PostgreSQL. A locally signed
payload uses Stripe's real signing/verification helpers but is not a live payment.
Real PostgreSQL locking, provider callbacks and production delivery are not
validated by those unit tests.

## Connector acceptance tests

- Use a seeded, isolated preview workspace with a regular admin and the required
  paid-plan entitlements. There is no documented ready-made preview test account.
- In Google consent, test Drive-only, Gmail read-only, Gmail read/send, and Calendar
  scope combinations. Confirm badges reflect the actual stored scopes. A saved
  grant is authorization evidence, not proof that a token is still accepted.
- Verify the reconnect/update permissions links in Arabic and English and on
  mobile/desktop. Keep application login separate from deployment protection.
- Validate read operations, expiry, revocation, refresh and tenant isolation before
  testing explicitly approved mail/event/workflow writes.
- Do not advertise beta/coming-soon catalog entries as live native integrations.

## Product and sale limitations

Chat currently enforces message/agent-run quotas; the wallet grant ledger alone
does not implement token debit enforcement or standalone top-up purchases. Define
those product contracts before implementing or selling them as complete features.

Retain upstream Apache-2.0 licensing and notices. Verify ownership of custom code,
brand assets, domain and data, and agree a credential-free transfer process. Local
tests and a READY deployment do not establish revenue, valuation, payouts status,
security certification or general commercial readiness.
