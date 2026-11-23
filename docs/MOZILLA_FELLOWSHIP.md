# Mozilla Fellowship brief: ZOOKA-AI

**Track:** Track II, Independent Fellow
**Focus:** Sovereign AI and public digital infrastructure
**Status:** preparation document for the full application (window expected mid February 2027).
A Letter of Intent has been submitted. This file is written for the reviewers of the full
application and for the maintainer who has to keep it true.
**Last verified against the running product:** 2026-11-23.

This document is deliberately narrow about claims. Every capability below is either linked to a
live URL or to a file in this repository. Anything that is planned rather than built is in
[Where the funding goes](#where-the-funding-goes) or [Open gaps](#open-gaps), never in the
present tense.

---

## 1. Summary

ZOOKA-AI is an Arabic-first AI workspace for small service businesses: cleaning companies,
maintenance workshops, clinics, shops. It gives one person the equivalent of a small operations
team (a chat assistant that can act inside the tools the business already uses, a media studio,
configurable agents, and integrations with Google Drive, GitHub, Vercel, n8n and Stripe billing)
inside a single Arabic and English interface with full right-to-left layout.

The problem is not that Arabic speakers lack access to a chat window. The problem is threefold:

1. **Language and layout.** Most business AI tools are English-first, and Arabic input arrives
   in a Latin-shaped interface. ZOOKA-AI is RTL by default, with Arabic content produced by the
   product itself (18 live articles at the time of writing).
2. **Access to the business's own systems.** A chat that cannot read the company drive, open a
   pull request or update a task is a toy for this audience. The workspace reaches real systems
   through scoped integrations.
3. **Data sovereignty.** A shop owner in the Gulf cannot audit a chain of sub-processors. The
   same code base runs as a hosted product and as a self-hosted stack on a machine the owner
   controls, with a provider-agnostic model layer, so the model endpoint is a configuration
   choice rather than an architectural commitment.

That third point is why this project belongs in a sovereign AI and public infrastructure track:
the software is written so that "which model, on whose hardware, under whose jurisdiction" is a
deployment decision, not a vendor decision.

---

## 2. What exists today (working product)

Live checks performed 2026-11-23 with plain HTTP requests, all returning `200`:

| URL | What it proves |
|---|---|
| https://zooka-ai.com | The production product, in use by real accounts |
| https://zooka-ai.com/ar | Arabic surface, RTL |
| https://zooka-ai.com/blog | 18 published Arabic articles (also present in `/sitemap.xml`) |
| https://zooka-ai.com/pricing | Stripe-backed plans |
| https://zooka-ai.com/login | Sign-in surface |
| https://zooka-ai.com/offline.html | The offline shell served by the service worker |
| https://zooka-ai.com/api/auth/providers | Reports `google` as a configured provider, plus other identity providers |

The application is not a prototype. Production data at the last verified backup: 282 user
accounts, 84 conversations, 388 stored messages, 399 usage events, 14 tables, `restoreReady` true.

**Repository:** https://github.com/ZOOKA-AI/chatbot (public)
**Stack:** Next.js 16 App Router, React 19, AI SDK 6, PostgreSQL with Drizzle, Auth.js 5, Stripe.
**Test surface:** 222 unit test files and 25 end-to-end specs. The self-hosted model layer has
its own suite: `tests/unit/platform-models.test.ts`, 8 of 8 passing, including a real HTTP call
against a local stub endpoint.

---

## 3. Alignment with the fellowship criteria

### Small

Small in team, surface and scope, not in ambition. The project is run by one founder with one AI
assistant as the engineering counterpart. It solves one problem (an Arabic-speaking small
business operating with AI inside its own accounts) instead of becoming a general platform.

What "small" means concretely in the code:

- The offline worker is dependency free, with no Workbox and no build step (`public/sw.js`).
- The model layer is a resolution function and a plain `fetch`, not a vendor SDK
  (`lib/platform/models.ts`).
- Storage is behind a three-value driver switch (`local`, `s3`, `vercel-blob`) instead of a
  managed service assumption.
- The self-hosted runtime is four processes and one database
  (`deploy/compose/docker-compose.yml`).

Honest caveat: the repository is large because it carries years of integration work. "Small" here
describes the product's footprint for its user, not the line count.

### Intentional

Every capability has a named user and a stated boundary. Examples:

- The guest tier allows three messages and stores no conversation (`GuestUsage` counters keyed by
  a cookie and a hashed IP per day).
- The offline service worker refuses to touch `/api/`, `/admin` or any non-GET request, so a
  stale cache can never serve someone else's data.
- The agent model selector reports a missing credential in the interface instead of failing at
  task time (`modelCredentialStatus` in `lib/agents/agent-config.ts`).
- Error reporting strips `request`, `user`, `breadcrumbs` and `extra`, and replaces exception text
  with a generic string before anything leaves the process.

The product also states what it does not do. The pricing and marketing surfaces describe execution
inside the customer's own accounts; they do not claim general reasoning superiority.

### Tailored

Built for a specific population: Arabic-speaking owners of small service businesses in the Gulf,
many of whom are the entire IT department. Consequences that a generic product would not make:

- RTL as the default direction, with the Arabic locale at `/ar` and Arabic content authored in
  product.
- A free plan that includes 1,000 messages per month, because the target user will not pay before
  seeing value.
- An offline page written in Arabic, and an installable PWA manifest, because connectivity in a
  shop or on a site visit is not reliable.
- A self-hosting path documented for someone with Docker and no cloud account
  (`docs/selfhosting/INSTALL.md`), because a small business may prefer to own the machine.

---

## 4. Privacy and data sovereignty

| Question a reviewer should ask | Answer, with the file that proves it |
|---|---|
| Where does the data live? | One PostgreSQL database. Self-hosted: on the operator's machine. Uploads can stay on a mounted volume with `STORAGE_DRIVER=local` instead of a vendor bucket. |
| What leaves the deployment? | The content of the turn being answered: prompt, selected attachments, and the tool results needed for that turn. Retention and training terms are those of the provider the operator configures. Point the deployment at a local endpoint and prompts do not leave the network. |
| Is there tracking? | GA4 and Vercel Analytics are mounted only after explicit consent (`components/cookie-consent.tsx`); before consent neither script exists in the page. No advertising SDK, no pixel, no data broker integration in the repository. |
| Is there error telemetry? | Sentry, optional, DSN-gated, with payload fields dropped and exception text genericised (`instrumentation.ts`). |
| Can one customer read another's data? | Every query is workspace scoped. Optional row level security exists behind `TENANT_RLS_ENABLED`. Honest status: the flag is off in the current production deployment. |
| What about guests? | Guest conversations are not stored at all. |

Two limits worth stating plainly. First, "privacy preserving" here means control over the
deployment and a small, auditable set of outbound calls; it does not mean cryptographic
guarantees or on-device inference, which the product does not have today. Second, the hosted
service does use third-party analytics after consent, and says so.

---

## 5. Local models and offline behaviour

This is the section where a fellowship application is most likely to overclaim, so it is written
as an inventory.

**Present**

- `lib/platform/models.ts` resolves `ollama` (default `http://127.0.0.1:11434/v1`), any
  `openai-compatible` endpoint (vLLM, LiteLLM, LM Studio, TGI), `gateway`, `anthropic` and
  `google`, and speaks the OpenAI-compatible wire format with plain `fetch`.
- Workspace administrators can pin an agent to one of those providers
  (`SELECTABLE_MODEL_PROVIDERS`), and the UI reports missing credentials.
- The self-hosted stack starts with no AI provider account when a local model is configured, for
  example `MODEL_PROVIDER=ollama MODEL_ID=llama3.1:8b` (`docs/selfhosting/PROVIDERS.md`).
- The application is installable and has a real offline shell: network-first navigation with a
  cached copy and then `/offline.html`, cache-first static assets, and a hard bypass for API,
  admin and non-GET traffic (`public/sw.js`, `app/manifest.ts`).

**Absent**

- No on-device or in-browser inference. No WebLLM, transformers.js or WASM model in the
  repository.
- The interactive chat route (`app/(chat)/api/chat/route.ts`) resolves models through
  `lib/ai/providers.ts` (gateway, Groq, Google). A self-hosted Ollama endpoint is reachable from
  the platform and agent configuration path, **not yet from the chat surface**. This is the single
  largest gap between the current product and a fully local deployment.
- No offline compose queue. The offline page is a shell; a message composed offline is not queued.
- No model at or below 10B parameters in default use. The smallest open-weight model in the
  hosted catalogue is `gpt-oss-20b` (20B) through Groq. `llama3.1:8b` is reachable only through
  the self-hosted Ollama path above.

---

## 6. Where the funding goes

A twelve month plan, ordered by how much each item closes a gap that a reviewer can verify. Shares
are a proposed allocation of the fellowship stipend, to be finalised against the programme's terms.

| Workstream | Share | Deliverable | How it is verified |
|---|---|---|---|
| Wire local inference into the chat path | 30% | `app/(chat)` resolves through the provider-agnostic layer, with Ollama and an OpenAI-compatible endpoint as first-class options, and a documented minimum machine spec | A conversation answered by a model served on the same machine, with the outbound network calls logged as zero |
| Offline compose and sync | 20% | A message composed offline is queued in the browser and sent on reconnect, with conflict rules documented | Reproduce on a throttled or disconnected client, then reconnect and confirm exactly-once delivery |
| Arabic evaluation set for small models | 15% | A public, reproducible evaluation of 7B to 10B models on Arabic business tasks (intent, extraction, reply drafting), with prompts and scoring scripts | Published results, re-runnable from the repository |
| Self-hosting and operator documentation | 15% | One-command install, upgrade and restore runbook, tested on a clean VPS and on ARM | A reviewer installs from the document alone and reaches a working chat |
| Community support in Arabic | 15% | Onboarding guides, workshops for small business owners, translated documentation, issue triage | Attendance, published material, resolved issues |
| Maintenance and release engineering | 5% | Security updates, dependency upgrades, regression tests | Green test suite and a release log |

Explicitly out of scope for the funding: marketing spend, paid acquisition, and any feature that
requires a proprietary model to function.

---

## 7. Community and Arabic access

- 18 Arabic articles live on the product site, written and published by the product's own
  pipeline, and indexed in `/sitemap.xml`.
- A free tier with 1,000 messages per month, so evaluation costs the user nothing.
- A public Discord server and a Telegram bot for support and announcements.
- The interface, the offline page and the manifest are Arabic first, with English alongside.

The community is small today. The honest statement is that the product has real users and a
measurable activation problem (of 282 accounts, 18 have sent a message), which is exactly the
problem the community workstream is meant to address.

---

## 8. Open gaps

1. **Licence clarity.** `LICENSE` holds the short Apache 2.0 notice inherited from the upstream
   Vercel template, not the full licence text, so GitHub reports the repository as `NOASSERTION`.
   Publishing the full text, or relicensing under MIT, is an owner decision. Until it is made, an
   open source reviewer sees an ambiguous licence.
2. **Local inference not wired into chat.** Described in section 5.
3. **No offline queue.** Described in section 5.
4. **No on-device inference.** Described in section 5.
5. **Row level security available but disabled in production.**
6. **Wallet consumption and top-up flows are not implemented**; message and agent quotas are.
7. **Bus factor of one.** The project depends on a single maintainer. Documentation and test
   coverage are the mitigation, not a solved problem.
8. **Pending workspace invitations are stored but not delivered.**

---

## 9. Verification log

Performed 2026-11-23 against `origin/main` at `319ad7d`:

- `GET` on the seven live URLs in section 2, all `200`.
- `GET /api/auth/providers` returns a JSON object containing `google` with its `signinUrl` and
  `callbackUrl`.
- Pull request #173 (chat replies were not persisted in production; Google sign-in callback
  crashed) merged 2026-11-20. Both fixes are present on `main`: `runAfterResponseInTenant` in
  `lib/db/tenant-client.ts`, used by `app/(chat)/api/chat/route.ts`, and the `NextRequest`
  construction fix in `lib/auth/google-transaction.ts`.
- `npx vitest run tests/unit/platform-models.test.ts`: 1 file passed, 8 tests passed.
- `sitemap.xml` contains 36 URLs, 18 of them distinct `/blog/` articles.

What this log does not prove: an end-to-end signed-in conversation. That requires a real account
session, which is an owner action, so persistence is verified at code and error-signature level,
not by a live message.

---

## 10. Owner decisions needed before the full application

1. Licence: publish the full Apache 2.0 text, or relicense under MIT. Either way, settle it before
   the reviewers read the repository.
2. Confirm the public demo surface: which URL a reviewer should open, and whether a demo account
   is provided.
3. Approve the funding allocation shares in section 6.
4. Approve enabling row level security in production, or state the reason it stays off.
5. Decide whether the local-inference workstream is the headline of the application (it is the
   strongest fit for the sovereign AI track, and the clearest current gap).

---

*This file is maintained alongside `README.md`. If a claim here stops being true, it is corrected
in the same commit that changes the behaviour.*
