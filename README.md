<p align="center">
  <img alt="ZOOKA-AI" src="public/images/og-image.jpg" width="760">
</p>

<h1 align="center">ZOOKA-AI</h1>

<p align="center">
  An Arabic-first AI workspace for small service businesses: chat, studio, agents and real
  integrations, built to run on infrastructure you control.
</p>

<p align="center">
  <a href="https://zooka-ai.com"><strong>Live site</strong></a> ·
  <a href="#what-it-solves"><strong>What it solves</strong></a> ·
  <a href="#privacy-by-architecture"><strong>Privacy</strong></a> ·
  <a href="#local-models-and-offline-behaviour"><strong>Local models</strong></a> ·
  <a href="#running-locally"><strong>Running locally</strong></a> ·
  <a href="docs/selfhosting/INSTALL.md"><strong>Self-hosting</strong></a> ·
  <a href="docs/MOZILLA_FELLOWSHIP.md"><strong>Fellowship brief</strong></a>
</p>

<br/>

> **Status:** live in production at [zooka-ai.com](https://zooka-ai.com) (verified 2026-11-23).
> This README describes what the software does today. Anything that is not implemented is listed
> under [Known gaps](#known-gaps) rather than described as a feature.

## What it solves

Small service businesses in the Gulf, such as a cleaning company, a maintenance workshop or a
clinic, do not lack AI chat windows. What they lack is an assistant that (a) speaks Arabic
properly, (b) can reach the tools the business already runs on, and (c) does not require handing
customer data to a chain of vendors the business cannot audit.

ZOOKA-AI is one workspace for that: a chat surface, a media studio, configurable agents and
integrations (Google Drive, GitHub, Vercel, n8n, Stripe billing) inside a single Arabic and
English interface with full RTL layout. The same code base runs as a hosted product at
`zooka-ai.com` and as a self-hosted stack on a machine the owner controls.

The people this is built for are the ones least served by English-first tools: a shop owner in
Ajman who writes in Arabic, a small team without a systems administrator, a business that cannot
send its customer list to a data processor it has never heard of.

## How it is built

| Layer | Choice | Note |
|---|---|---|
| Web | Next.js 16 App Router, React 19 | server components, stateless process |
| Model access | Vercel AI Gateway by default, direct Groq and Google paths when keys exist | plus a provider-agnostic layer for self-hosting, see [local models](#local-models-and-offline-behaviour) |
| Data | PostgreSQL via Drizzle ORM | every chat, document and usage event is scoped to a workspace |
| Auth | Auth.js 5 with Google sign-in | `GET /api/auth/providers` lists the live providers |
| Billing | Stripe subscriptions, wallet ledger | hosted deployment only |
| App shell | PWA manifest, service worker, offline page | `app/manifest.ts`, `public/sw.js`, `public/offline.html` |
| Self-host runtime | web + worker + scheduler + PostgreSQL, Docker Compose | `deploy/compose/docker-compose.yml` |

The self-hosted stack is documented in [docs/selfhosting/](docs/selfhosting/): architecture,
installation, operations and provider swapping.

## Privacy by architecture

| Concern | What actually happens |
|---|---|
| Where data lives | One PostgreSQL database you control. A self-hosted install can keep it on your own machine, and `STORAGE_DRIVER=local` keeps uploaded files on a mounted volume instead of a vendor bucket. |
| What reaches a model provider | Only the content of the turn being answered (prompt, selected attachments, tool results needed for that turn). Retention and training terms are those of the provider you configure. If you point the deployment at a local model, prompts never leave your network. |
| Analytics | GA4 and Vercel Analytics load **only after explicit consent**. Until the visitor chooses, neither script is mounted (`components/cookie-consent.tsx`). Details page: `/cookies`. |
| Error reporting | Sentry is optional and DSN-gated. `beforeSend` drops `request`, `user`, `breadcrumbs` and `extra`, and replaces exception text with a generic string (`instrumentation.ts`, `instrumentation-client.ts`). |
| Tenant isolation | Every query is workspace scoped. Optional row level security can be enforced with `TENANT_RLS_ENABLED`; when the flag is off the app uses the shared connection, which is the current production setting. |
| Guest mode | Guest conversations are not stored. The free-message counter is keyed by an HTTP-only cookie and a hashed IP per day, not by identity. |
| Ads | No advertising SDK, no third-party pixel and no data broker integration in this repository. |

## Local models and offline behaviour

This section is deliberately narrow, because it is the part most easily overstated.

**What exists today**

- A provider-agnostic model resolution layer, `lib/platform/models.ts`, supports `ollama`
  (default `http://127.0.0.1:11434/v1`), any `openai-compatible` endpoint (vLLM, LiteLLM,
  LM Studio, TGI), `gateway`, `anthropic` and `google`. It is covered by unit tests:
  `tests/unit/platform-models.test.ts` passes 8 of 8, including a real call against a local stub
  server.
- Workspace administrators can pin an agent to one of those providers
  (`SELECTABLE_MODEL_PROVIDERS` in `lib/agents/agent-config.ts`), and the UI reports a missing
  credential instead of failing at task time.
- The self-hosted compose stack starts with no AI provider account at all if you run a model
  locally, for example `MODEL_PROVIDER=ollama MODEL_ID=llama3.1:8b`.
- The app is installable and has a real offline shell: `public/sw.js` serves navigation
  network-first with a cached copy and then `/offline.html`, caches static assets cache-first, and
  never touches `/api/`, `/admin` or any non-GET request. `app/manifest.ts` declares only
  capabilities that exist.

**What does not exist today**

- No on-device or in-browser inference. There is no WebLLM, transformers.js or WASM model in the
  repository.
- The interactive chat route, `app/(chat)/api/chat/route.ts`, resolves models through
  `lib/ai/providers.ts` (gateway, Groq, Google). A self-hosted Ollama endpoint is reachable from
  the platform and agent configuration path, **not yet from the chat UI**. This is the single
  largest gap between the current product and a fully local deployment.
- No offline message queue. The offline page is a shell; composing or sending a message while
  offline is not supported.
- No model at or below 10B parameters is used by default. The smallest open-weight model in the
  hosted catalogue is `gpt-oss-20b` (20B) through Groq. `llama3.1:8b` is only reachable through
  the self-hosted Ollama path described above.

## Open source status

- The repository is public: [github.com/ZOOKA-AI/chatbot](https://github.com/ZOOKA-AI/chatbot).
- `LICENSE` carries the **Apache License 2.0** notice inherited from the upstream Vercel AI
  Chatbot template, which is credited there as `Copyright 2024 Vercel, Inc.`. `NOTICE` records
  that provenance and the project's own additions.
- `LICENSE` now holds the complete, unmodified Apache License 2.0 text (published 2026-11-23, byte
  identical to `apache.org/licenses/LICENSE-2.0.txt` apart from the copyright line, which keeps
  `Copyright 2024 Vercel, Inc.`). GitHub detects the repository as `Apache-2.0`. Relicensing under
  MIT remains an option for the owner, and would require replacing this file deliberately.

## Running locally

Requirements: Node.js 22 or newer, pnpm 9, and PostgreSQL 14 or newer.

```bash
pnpm install
cp .env.example .env.local      # every variable is documented in the file
```

Set at least:

```bash
POSTGRES_URL=postgres://user:pass@host:5432/zooka
AUTH_SECRET=$(openssl rand -base64 32)
GOOGLE_LOGIN_CLIENT_ID=...      # Google sign-in (openid/email/profile)
GOOGLE_LOGIN_CLIENT_SECRET=...
GROQ_API_KEY=...                # or AI_GATEWAY_API_KEY, or GEMINI_API_KEY
```

Then:

```bash
pnpm db:migrate   # apply the numbered SQL migrations, re-running is a no-op
pnpm dev          # http://localhost:3000
```

`pnpm build` only compiles the application and never touches a database. Run `pnpm db:migrate` as
a deliberate release step against the target environment, and never point a preview migration at
production.

Tests:

```bash
pnpm test:unit    # 222 unit test files (vitest, plus the model catalogue test)
pnpm test:e2e     # 25 Playwright specs, needs the app and a database running
```

Self-hosted install instead of local development: [docs/selfhosting/INSTALL.md](docs/selfhosting/INSTALL.md).

## Repository layout

| Path | Contents |
|---|---|
| `app/(chat)/` | chat surface, workspace and billing pages |
| `app/api/` | REST routes: chat, auth, billing, integrations, webhooks |
| `lib/ai/` | model catalogue and provider wiring for the chat route |
| `lib/platform/` | self-host runtime: config, model resolution, storage drivers |
| `lib/agents/` | agent configuration, tools, execution |
| `docs/selfhosting/` | install, architecture, operations, providers |
| `deploy/compose/` | Docker Compose stack (web, worker, scheduler, Postgres, MinIO) |
| `tests/` | unit and Playwright suites |

## Known gaps

Honest list as of 2026-11-23:

1. The chat UI does not use the local-model path yet (see above).
2. No offline compose or send queue.
3. Wallet consumption and top-up flows are not implemented; message and agent quotas are.
4. Pending workspace invitations are stored but not emailed or self-service accepted.
5. Video generation is not implemented; image generation is.
6. Row level security is available but not enabled in production.

## Operations reference

The sections below document the hosted deployment in detail: workspaces and plans, Stripe
billing, credit grants, the guest paywall, WhatsApp Cloud API, SEO and the launch checklist.

### WhatsApp Cloud API

Configure `WHATSAPP_VERIFY_TOKEN` and `WHATSAPP_APP_SECRET` for Meta webhook
verification, and `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` for
outbound replies. Subscribe `/api/webhooks/whatsapp` to message events for that
phone number and apply the database migrations. Verified incoming text messages
are claimed by message ID and answered asynchronously using the default chat
model and assistant prompt. Replies are stateless and cannot access workspace
data or tools. If either outbound setting is missing, deliveries are acknowledged
without a reply. Processing failures are logged and acknowledged; a claimed
message is not automatically retried, to avoid duplicate replies.
`N8N_WHATSAPP_FORWARD_URL`, when configured, still forwards webhook deliveries
separately.

## Workspaces and plans

Every account receives a default workspace and can belong to multiple
workspaces. Workspace members have `owner`, `admin`, or `member` roles; owners
and admins can rename the workspace, manage member roles, add existing accounts,
and create seven-day invitation records. Pending invitations are not emailed or
self-service accepted yet. Chat and document data, subscription records, and
usage events are scoped to the validated active workspace. The `free` plan
includes 1,000 messages each month; paid plans use Stripe Checkout.

### Workspace secrets

Set `WORKSPACE_SECRETS_ENCRYPTION_KEY` to a dedicated, securely stored base64
32-byte key (`openssl rand -base64 32`) before using the vault. Keep the same key
across deployments and backups: changing or losing it makes existing values
unreadable; rotate individual values through the API instead. Values are
AES-256-GCM encrypted with fresh nonces and workspace/name binding. Names use
uppercase letters, digits and underscores (up to 64 characters, starting with
a letter or underscore); values are 1–8192 characters.

Owners and admins can list and create secrets at `/api/workspace/secrets`,
and inspect metadata, rotate (`PATCH { "value": "..." }`) or delete by name at
`/api/workspace/secrets/[name]`. Responses never include secret values.
Detection settings are workspace-scoped, default on, and owner/admin-managed at
`/api/workspace/secrets/settings`. `lastUsedAt` changes on server-side reads,
not metadata access. To check GitHub access without inspecting files, create a task
with `payload: { "tool": "github_repo_probe", "repo": "owner/repo", "secretName": "GITHUB_KEY" }`.
The probe selects the named workspace secret, never falls back to another
credential, and returns only a fixed success/failure result. Repository inspection
does not accept named secrets and will refuse rather than claim a probe was an inspection.
Only assign that tool to trusted agents: it can send a named workspace secret as
a GitHub credential to the allowlisted repository endpoint.

Apply `pnpm db:migrate` after setting `POSTGRES_URL` in `.env.local` to create
the workspace tables and backfill existing users, chats, and documents. Use
`/workspace` to manage a workspace and `/workspace/billing` to inspect its plan
and usage. New accounts and guest sessions are provisioned automatically.

### Stripe subscriptions

Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO`, and
`STRIPE_PRICE_BUSINESS` in `.env.local`. Set `NEXT_PUBLIC_APP_URL` to the
canonical production origin; Vercel's `VERCEL_URL` is used as a fallback. The
price variables must contain recurring monthly USD Price IDs created in Stripe,
not lookup keys. Create Pro at $19/month with lookup key `zooka_pro_monthly` and
Business at $49/month with lookup key `zooka_business_monthly`; store their Price
IDs in the corresponding environment variables. If Stripe keys or a Price ID
are missing, the pricing page disables that upgrade and explains which setting
is required. Configure a Stripe webhook pointing to
`https://zooka-ai.com/api/stripe/webhook` (the legacy `/api/webhooks/stripe`
path still works) and enable `checkout.session.completed`,
`customer.subscription.updated`, `customer.subscription.deleted`,
`invoice.payment_failed`, and `invoice.paid`. Checkout is restricted to workspace owners and
admins; the signed webhook synchronizes subscription status, plan, Stripe
customer ID, and current period end into the existing `Subscription` table
(a failed invoice marks the workspace `past_due`). Pro and Business plans
receive higher hourly and monthly message limits plus access to advanced
models.

### Credit grants and reconciliation

`invoice.paid` grants the configured recurring plan allowance only after signature
verification. The grant uses the invoice line's price and billing period, not the
subscription's current period. Grant failures return HTTP 500 for Stripe retry;
a 200 response is not a substitute for checking the wallet. Zero-paid and
proration-only invoices do not replenish the allowance. Multi-line or incomplete
invoices fail closed for review. Workspace-scoped transaction locks prevent
concurrent retries from granting twice; an older or same-period invoice cannot
reset a newer wallet. Period renewal replaces, rather than accumulates, credits.

`POST /api/billing/reconcile` requires a signed-in regular workspace owner/admin
and a same-origin `Origin` header. It inspects at most the latest 100 paid invoices
for that workspace's stored customer, verifies subscription ownership, and
returns `hasMore` if older history remains. GET never reconciles. This is not a
public cron endpoint. Inspect historical balances in both databases before
release if the app previously had both `DATABASE_URL` and `POSTGRES_URL` set:
wallets now follow the app's `DATABASE_URL`-first policy. Do not copy or replay
balances blindly. No database migration or production reconciliation is performed
by a build.

The wallet grant ledger alone is **not** a fully implemented token-metered
billing product: chat currently applies message and agent-run quotas, and wallet
consumption/top-up purchase flows still require implementation and validation.

### Subscription management

Subscribed workspace owners and admins with a Stripe customer ID see a
"Manage account / إدارة الاشتراك" button in the sidebar, header, and
`/workspace/billing`. It calls `POST /api/billing/portal`, which opens a Stripe
Customer Portal session that returns to the app. Enable the Customer Portal in
the Stripe Dashboard (Settings → Billing → Customer portal) before launch.

### Guest paywall

When `GUEST_PAYWALL_ENABLED=true`, visitors who are not signed in may send 3 free messages. The count is tracked in
`localStorage` for the UI and enforced by `POST /api/chat`, which stores
counters in the `GuestUsage` table keyed by an HTTP-only `zooka_guest` cookie
and by a hashed IP address per day. Further messages receive HTTP `402` and the
UI shows a modal with Sign up, Log in, and View plans actions. Guest
conversations are not stored.

### Workspace names

Workspaces have a `name` (existing `Organization.name` column). Numeric default
names such as `1792738151875` are replaced by "مساحة عمل جديدة" by migration
`0010`, and new workspaces for such accounts use that default. Owners and admins
can rename from the sidebar dialog, `/workspace`, or `PATCH /api/workspace`
(`{ "name": "..." }`, 2–80 characters).

### SEO

`app/layout.tsx` sets metadata for `https://zooka-ai.com` (title, description,
canonical, Open Graph, Twitter `summary_large_image`, icons, theme color).
`app/opengraph-image.tsx` and `app/twitter-image.tsx` generate the branded
1200×630 image, and `app/robots.ts` / `app/sitemap.ts` serve `robots.txt` and
`sitemap.xml`.

### Launch checklist

1. In Stripe, create the Pro ($19/month) and Business ($49/month) recurring
   prices and set `STRIPE_PRICE_PRO` / `STRIPE_PRICE_BUSINESS`.
2. Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_APP_URL=https://zooka-ai.com`.
3. Add the webhook endpoint `https://zooka-ai.com/api/stripe/webhook` and the
   events listed above; enable the Customer Portal.
4. Confirm the target environment's `POSTGRES_URL` and a current backup, then
   run `pnpm db:migrate` as a deliberate release step to apply migration
   `0010_guest_usage_workspace_names`. Vercel builds do not run migrations.

## ✨ Sponsors

Support the development of this project! Sponsors are recognized below automatically.

<!-- sponsors:start -->
[![Become a sponsor](https://img.shields.io/badge/Become_a-❤️_sponsor-ea4aaa?style=flat-square&logo=github)](https://github.com/sponsors/ZOOKA-AI)
<!-- sponsors:end -->

[![Sponsor ZOOKA-AI](https://img.shields.io/badge/Support-open_source-0366d6?style=flat-square&logo=github-sponsors)](https://github.com/sponsors/ZOOKA-AI)

<!-- redeploy trigger: 2026-10-29 01:52 UTC -->

## Studio templates → Chat
Open any template in Studio and click **عدّل في الشات**. The chat starts with the template loaded via `?template=` query param.
