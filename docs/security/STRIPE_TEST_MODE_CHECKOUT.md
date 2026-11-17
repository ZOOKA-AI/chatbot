# Stripe test-mode checkout — plan and current status

**Date:** 2026-11-18. **Status:** BLOCKED on one input (a test-mode secret key). No real or
test payment was made, and production keys were not touched.

## What already exists

| piece | state |
| --- | --- |
| `POST /api/billing/checkout` | exists; requires `STRIPE_SECRET_KEY`, resolves the price id per plan, creates a `mode: "subscription"` session, returns 401 without a session |
| price ids | PRO and BUSINESS configured as environment values |
| webhook | `app/api/stripe/webhook/route.ts` verifies the signature, retrieves the subscription, checks that `metadata.organizationId` and `metadata.plan` match the Checkout session, then `syncWorkspaceSubscription` (service connection) |
| stale test data | the checkout route already guards against leftover test-mode subscription rows |

Nothing here needs new code to run a test-mode pass. What is missing is a **test-mode secret
key**, which only the owner can provide.

## What the owner must supply, and how

1. `STRIPE_SECRET_KEY` with an `sk_test_…` value, set in the **Preview** environment only.
2. Test-mode price ids for PRO and BUSINESS (test-mode prices have different ids).
3. A test-mode webhook signing secret if the preview deployment should exercise the webhook.

These are entered in the Vercel dashboard or stored with `set_secrets`. They must never be
pasted into chat, a commit, or a note.

## Test matrix to run once the key exists

| step | expected |
| --- | --- |
| checkout with no session | 401 |
| checkout signed in, plan `pro`, test card `4242 4242 4242 4242` | session created, redirect to Stripe test checkout |
| complete payment | `Subscription` row `plan=pro`, `status=active`, `stripeSubscriptionId` set |
| webhook `checkout.session.completed` | signature verified, metadata match enforced, row updated once (idempotent re-delivery) |
| tampered metadata | rejected, no row written |
| cancel at period end | `status` reflects it, no entitlement regression |
| cleanup | delete the test `Subscription` rows and the test customer |

## Explicit boundaries

- Production keys stay `sk_live_…` and are never used from a preview deployment.
- The test run must not send real receipts: the mail relay is switched off in preview, or the
  test uses a localhost address.
- If the owner prefers, the whole matrix can run against a Stripe sandbox account instead of
  the live account's test mode; the code path is identical because it only reads the key.

## Why this matters before a paid launch

The checkout route has never completed a paid flow in production: four subscriptions exist,
all created by onboarding rather than by Stripe. Until this matrix runs, the only untested
path in the revenue system is the one that takes money.
