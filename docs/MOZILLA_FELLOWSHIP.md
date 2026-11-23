# ZOOKA-AI — Mozilla Fellowship Preparation Notes

**Track:** Track II, Independent Fellow
**Focus:** Sovereign AI and public digital infrastructure
**Status:** preparation notes for the full application (window expected mid February 2027). A
Letter of Intent has been submitted.
**Last verified against the running product:** 2026-11-23.

Every claim below is either linked to a live URL or to a file in this repository. Anything that is
planned rather than built is written as planned, never in the present tense. The verification log
at the end records exactly what was checked and what was not.

## Project Summary

ZOOKA-AI is an open-source AI business agent platform aimed at Arabic-speaking service companies
and small businesses. It provides chat, studio tools, integrations, and workspace management with a
focus on practical utility rather than general consumer chat.

The problem is not that Arabic speakers lack a chat window. A cleaning company, a maintenance
workshop or a clinic in the Gulf needs three things that English-first tools do not give it:

1. **Arabic and RTL by default.** ZOOKA-AI runs as an Arabic-first surface with English alongside,
   and publishes its own Arabic content (18 articles live at the time of writing).
2. **Access to the business's own systems.** Chat that cannot read the company drive, open a pull
   request or update a task is a toy for this audience. The workspace reaches real systems through
   scoped integrations (Google Drive, GitHub, Vercel, n8n, Stripe billing).
3. **Control over where data and inference happen.** The same code base runs as a hosted product
   and as a self-hosted stack on a machine the owner controls, with a provider-agnostic model
   layer, so the model endpoint is a deployment decision rather than a vendor decision.

That third point is why this project belongs in a sovereign AI and public infrastructure track.

**Stack:** Next.js 16 App Router, React 19, AI SDK 6, PostgreSQL with Drizzle, Auth.js 5, Stripe.
**Repository:** https://github.com/ZOOKA-AI/chatbot (public).
**Test surface:** 222 unit test files and 25 end-to-end specs. The self-hosted model layer has its
own suite, `tests/unit/platform-models.test.ts`, 8 of 8 passing, including a real HTTP call against
a local stub endpoint.

## Alignment with Mozilla Human-Scale AI Criteria

### Small

Small in team, surface and scope, not in ambition. The project is run by one founder with one AI
assistant as the engineering counterpart, and it solves one problem instead of becoming a general
platform.

What "small" means concretely in the code:

- The offline worker is dependency free, with no Workbox and no build step (`public/sw.js`).
- The model layer is a resolution function plus a plain `fetch`, not a vendor SDK
  (`lib/platform/models.ts`).
- Storage sits behind a three-value driver switch (`local`, `s3`, `vercel-blob`) instead of a
  managed-service assumption.
- The self-hosted runtime is four processes and one database
  (`deploy/compose/docker-compose.yml`).

Honest caveat: the repository is large because it carries years of integration work. "Small" here
describes the product's footprint for its user, not the line count.

### Intentional

Every capability has a named user and a stated boundary:

- The guest tier allows three messages and stores no conversation (counters keyed by an HTTP-only
  cookie and a hashed IP per day).
- The service worker refuses to touch `/api/`, `/admin` or any non-GET request, so a stale cache
  can never serve another account's data.
- The agent model selector reports a missing credential in the interface instead of failing at task
  time (`modelCredentialStatus` in `lib/agents/agent-config.ts`).
- Error reporting drops `request`, `user`, `breadcrumbs` and `extra`, and replaces exception text
  with a generic string before anything leaves the process (`instrumentation.ts`).

The product also states what it does not do. Marketing describes execution inside the customer's
own accounts; it does not claim general reasoning superiority over consumer chat tools.

### Tailored

Built for a specific population: Arabic-speaking owners of small service businesses in the Gulf,
many of whom are the entire IT department.

- RTL as the default direction, with the Arabic locale at `/ar` and Arabic content authored in
  product.
- A free plan that includes 1,000 messages per month, because the target user will not pay before
  seeing value.
- An offline page written in Arabic and an installable manifest, because connectivity in a shop or
  on a site visit is not reliable.
- A self-hosting path documented for someone with Docker and no cloud account
  (`docs/selfhosting/INSTALL.md`), because a small business may prefer to own the machine.

### Privacy and data sovereignty (evidence)

| Question a reviewer should ask | Answer, with the file that proves it |
|---|---|
| Where does the data live? | One PostgreSQL database. Self-hosted, it sits on the operator's machine, and `STORAGE_DRIVER=local` keeps uploads on a mounted volume instead of a vendor bucket. |
| What leaves the deployment? | The content of the turn being answered: prompt, selected attachments, and the tool results needed for that turn. Retention and training terms are those of the provider the operator configures. Point the deployment at a local endpoint and prompts do not leave the network. |
| Is there tracking? | GA4 and Vercel Analytics are mounted only after explicit consent (`components/cookie-consent.tsx`); before consent neither script exists in the page. No advertising SDK, no pixel, no data broker integration in the repository. |
| Is there error telemetry? | Sentry, optional and DSN-gated, with the payload fields above dropped. |
| Can one customer read another's data? | Every query is workspace scoped. Optional row level security exists behind `TENANT_RLS_ENABLED`. Honest status: the flag is off in the current production deployment. |
| What about guests? | Guest conversations are not stored at all. |

Two limits worth stating plainly. "Privacy preserving" here means control over the deployment and a
small, auditable set of outbound calls; it does not mean cryptographic guarantees or on-device
inference, which the product does not have today. And the hosted service does use third-party
analytics after consent, which is why the consent gate exists.

### Local models and offline behaviour (present and absent)

This is the section most easily overstated, so it is written as an inventory.

**Present**

- `lib/platform/models.ts` resolves `ollama` (default `http://127.0.0.1:11434/v1`), any
  `openai-compatible` endpoint (vLLM, LiteLLM, LM Studio, TGI), `gateway`, `anthropic` and
  `google`, speaking the OpenAI-compatible wire format with plain `fetch`. It is not yet wired into
  the main chat flow.
- Workspace administrators can pin an agent to one of those providers (`SELECTABLE_MODEL_PROVIDERS`
  in `lib/agents/agent-config.ts`), and the UI reports missing credentials instead of failing at
  task time.
- The self-hosted stack starts with no AI provider account when a local model is configured, for
  example `MODEL_PROVIDER=ollama MODEL_ID=llama3.1:8b` (`docs/selfhosting/PROVIDERS.md`).
- The application is installable with a real offline shell: network-first navigation with a cached
  copy and then `/offline.html`, cache-first static assets, and a hard bypass for API, admin and
  non-GET traffic (`public/sw.js`, `app/manifest.ts`).

**Absent**

- No on-device or in-browser inference. No WebLLM, transformers.js or WASM model in the repository.
- The interactive chat route (`app/(chat)/api/chat/route.ts`) resolves models through
  `lib/ai/providers.ts` (gateway, Groq, Google). A self-hosted Ollama endpoint is reachable from the
  platform and agent configuration path, not yet from the chat surface. This is the single largest
  gap between the current product and a fully local deployment.
- No offline compose queue. The offline page is a shell; a message composed offline is not queued.
- No model at or below 10B parameters in default use. The smallest open-weight model in the hosted
  catalogue is `gpt-oss-20b` (20B) through Groq. `llama3.1:8b` is reachable only through the
  self-hosted Ollama path above.

## Funding Use Plan (if selected)

Twelve months, ordered by how much each item closes a gap a reviewer can verify. Shares are a
proposed allocation of the stipend, to be finalised against the programme's terms.

| Workstream | Share | Deliverable | How it is verified |
|---|---|---|---|
| Wire the local and small-model path into the production chat | 30% | `app/(chat)` resolves through the provider-agnostic layer, with Ollama and an OpenAI-compatible endpoint as first-class options and a documented minimum machine spec. Goal: small open models (10B or less) as the default or an easily selected path. | A conversation answered by a model on the same machine, with outbound network calls logged as zero |
| Improve offline capability beyond the current shell | 20% | A message composed offline is queued in the browser and sent on reconnect, with documented conflict rules | Reproduce on a disconnected client, reconnect, confirm exactly-once delivery |
| Documentation, community onboarding and Arabic localization | 15% | One-command install and restore runbook tested on a clean VPS and on ARM; Arabic onboarding guides and workshops; translated docs | A reviewer installs from the document alone and reaches a working chat |
| Arabic evaluation set for small models | 15% | Public, reproducible evaluation of 7B to 10B models on Arabic business tasks (intent, extraction, reply drafting) | Published results, re-runnable from the repository |
| Security and tenant isolation hardening | 15% | Row level security enabled in production with a tested rollback path, tenant isolation tests, dependency and secret hygiene | Isolation tests green in CI, RLS verified on a production-shaped database |
| Maintenance and release engineering | 5% | Security updates, dependency upgrades, regression tests | Green test suite and a release log |

Out of scope for the funding: marketing spend, paid acquisition, and any feature that requires a
proprietary model to function.

## Live Links

All checked 2026-11-23 with plain HTTP requests, returning `200`:

| URL | What it proves |
|---|---|
| https://zooka-ai.com | The production product, in use by real accounts |
| https://zooka-ai.com/ar | Arabic surface, RTL |
| https://zooka-ai.com/blog | 18 published Arabic articles, also present in `/sitemap.xml` |
| https://zooka-ai.com/pricing | Stripe-backed plans |
| https://zooka-ai.com/login | Sign-in surface |
| https://zooka-ai.com/offline.html | The offline shell served by the service worker |
| https://zooka-ai.com/api/auth/providers | Reports `google` as a configured provider, plus other identity providers |

- Repository: https://github.com/ZOOKA-AI/chatbot
- Self-hosting documentation: https://github.com/ZOOKA-AI/chatbot/tree/main/docs/selfhosting

The product is not a prototype: the last verified production backup holds 282 user accounts, 84
conversations, 388 stored messages, 399 usage events across 14 tables, with `restoreReady` true.

## Known Gaps

1. **No default ≤10B model in the main chat path.** The local-model layer exists and is tested, but
   the chat route still resolves through the hosted providers.
2. **Offline is a shell only.** No queue, no sync, no offline compose, and no on-device inference.
3. **LICENSE file is incomplete.** It holds the short Apache 2.0 notice inherited from the upstream
   Vercel template rather than the full licence text, so GitHub reports the repository as
   `NOASSERTION`. Publishing the full text or relicensing under MIT is an owner decision.
4. **Row level security is available but disabled in production.**
5. **Wallet consumption and top-up flows are not implemented**; message and agent quotas are.
6. **Bus factor of one.** Documentation and test coverage are the mitigation, not a solved problem.
7. **Pending workspace invitations are stored but not delivered.**
8. **Activation is weak.** Of 282 accounts, 18 have sent a message. That is a product problem, and
   it is what the community workstream is meant to address.

## Verification log

Performed 2026-11-23 against `origin/main` at `319ad7d`:

- `GET` on the seven live URLs above, all `200`.
- `GET /api/auth/providers` returns a JSON object containing `google` with its `signinUrl` and
  `callbackUrl`.
- Pull request #173 (assistant replies were not persisted in production; the Google sign-in
  callback crashed) merged 2026-11-20. Both fixes are present on `main`: `runAfterResponseInTenant`
  in `lib/db/tenant-client.ts`, used by `app/(chat)/api/chat/route.ts`, and the `NextRequest`
  construction fix in `lib/auth/google-transaction.ts`.
- `npx vitest run tests/unit/platform-models.test.ts`: 1 file passed, 8 tests passed.
- `sitemap.xml` contains 36 URLs, 18 of them distinct `/blog/` articles.

What this log does not prove: an end-to-end signed-in conversation. That needs a real account
session, which is an owner action, so chat persistence is verified at code and error-signature
level rather than by a live message.

## Owner decisions needed before the full application

1. Licence: publish the full Apache 2.0 text, or relicense under MIT. Settle it before reviewers
   read the repository.
2. Confirm the demo surface: which URL a reviewer opens, and whether a demo account is provided.
3. Approve the funding allocation shares above.
4. Enable row level security in production, or record the reason it stays off.
5. Confirm that the local-inference workstream is the headline of the application. It is the
   strongest fit for the sovereign AI track and the clearest current gap.

---

*Maintained alongside `README.md`. If a claim here stops being true, it is corrected in the same
commit that changes the behaviour.*
