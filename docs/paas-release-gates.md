# Client hosting and domains: current release boundary

Zooka is intended to host customer sites and bill customers for hosting/domains.
The current project row is NOT a deployment. Creating it returns published:false
and previewUrl:null, never a speculative subdomain URL. Attaching a domain in
storage does not mark a project ACTIVE. Domain attachment is workspace-scoped.
No generated site code, deployment, DNS records or certificate is created here.

## Actual registrar reads

`POST /api/domains` CHECK reads Vercel's documented registrar availability and
price endpoints, not RDAP. RDAP 404 does not establish retail availability and
cannot determine premium pricing or registration restrictions.

The request accepts a domain name, not a URL. IDNs normalize to ASCII. It does
not silently strip www, schemes or paths. API responses include source and
checkedAt. Registered names have quote:null. Missing/invalid/unavailable price
responses yield quote:null, never a default price or a checkout offer. The quote
is raw registrar data for the requested period, not a guaranteed customer sale
price or reservation. Price reads may need the application's Vercel access;
configure server-side access through a reviewed integration. Managed agent
credentials are not application credentials and must not be copied into code.
Never expose a token in NEXT_PUBLIC variables or client-side requests.

PURCHASE currently returns 503 regardless of provider tokens. The previous
implementation could create a Stripe payment session when OPENPROVIDER_TOKEN
existed, but no domain_purchase fulfillment handler existed anywhere in the
repository. Charging in that state would collect money without registration.
This PR removes that unsupported checkout, not a working registrar workflow.
No charge, order or registration is created. Any existing payments from earlier
code must be reconciled separately in Stripe; this change does not audit them.

## Database release

Project storage uses DATABASE_URL before POSTGRES_URL, matching the app.
Normal requests no longer execute CREATE TABLE/INDEX on production. Generate
and review the registered client_projects migration and run it on isolated
staging before approving production. CREATE TABLE IF NOT EXISTS does not repair
an incompatible existing table. Previous self-created Project tables used jsonb
and extra partial custom-domain indexes; inspect and reconcile actual schema
before migration. Preserve history and do not blindly replay standalone SQL.

## Required next implementation (not delivered by these safety fixes)

1. A versioned source bundle or reviewed template per workspace, separate from
   arbitrary untrusted customer code executed inside the platform's runtime.
2. A provisioning worker with least-privilege hosting access, idempotent project
   creation, recorded deployment IDs, status polling and failure recovery.
3. Confirm READY deployment and routing before exposing previewUrl; never allow
   customer code to inherit platform credentials or privileged callbacks.
4. Registrar quote validation, supported-TLD contact schema, customer consent,
   ownership checks and durable domain-order records before payment collection.
5. Signed payment confirmation and idempotent registrar fulfillment; reconcile
   unknown purchase outcomes before retries. Handle registration failure with
   explicit refund/manual review rather than reporting a purchased domain.
6. DNS/SSL verification, renewal notices, cancellation/refund/transfer policy and
   ongoing hosting billing. Customer data/registrant information needs proper
   storage and consent, not application-session defaults.

No hosting infrastructure, domains, payment configuration, credentials or
production migrations were changed by this source work. The reference web
page supplied by the user was not independently inspectable; no claim of design
or functionality parity is made.
