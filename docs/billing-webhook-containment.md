# Billing and WhatsApp containment

This change contains three confirmed audit findings. It does not enable a new
provider or change production settings, schema, Stripe events, wallets or secrets.

- Reconciliation GET returns 405. POST requires a regular workspace owner/admin
  and returns 503 without querying Stripe or writing balances. Reconciliation
  remains disabled until workspace/customer ownership, paid invoice-line periods,
  durable idempotency and historical invoice handling are implemented together.
  Existing callers depending on this unsafe endpoint must handle unavailability.
- WhatsApp POST requires WHATSAPP_APP_SECRET and validates the raw-body HMAC.
  If the secret is missing it returns 503, not an unverified 200. The operator
  must configure the actual Meta app secret privately before deliveries can be
  accepted. WHATSAPP_VERIFY_TOKEN only verifies the setup challenge and cannot
  substitute for the app secret. GET challenge verification is unchanged.
- invoice.paid wallet grant failures reach the outer error handler: release the
  event claim and return 500 so Stripe can retry. A repeated grant is still
  bounded by the existing invoice grant key. This does not fix all wallet issues.

Tests use fabricated events/configuration and mocks only; no real Stripe invoice
is replayed. New tests cover absent/wrong/correct WhatsApp signatures, unchanged
GET verification, unauthenticated/guest/member/privileged reconciliation and
invoice grant failure followed by retry success.

Remaining gates: wallet database priority, old/same-period grants, concurrency,
paid invoice-line validation, durable webhook processing and fail-open claim
storage behavior. Existing migration integration test is independently failing
on the unmodified base (multi-command prepared statement in PGlite); do not
weaken that test as part of this containment. Review existing billing work in
PR #28 before restoring reconciliation. The audit's other dependency, consent,
admin migration and deployment-alias findings remain open.
