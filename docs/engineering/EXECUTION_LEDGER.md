# ZOOKA-AI — Execution Ledger

Status vocabulary (the only allowed values):
`NOT_STARTED` · `IN_PROGRESS` · `IMPLEMENTED_NOT_DEPLOYED` · `VERIFIED` · `BLOCKED` · `WAITING_APPROVAL`

`VERIFIED` means a command produced evidence that is quoted with it. A green CI
badge is not evidence for behaviour; a passing test is not evidence for a
deployed path.

Baseline at creation: `main` = `19473c0d`, production deployment `dpl` on
`19473c0d` READY, preview environments isolated, three draft PRs (#89, #90, #91).

---

## Stage 0 — Repository and architecture audit

| ID | Task | Status | Evidence |
|---|---|---|---|
| 0.1 | Read current branch/PR/deployment state | VERIFIED | `main` `19473c0d`; #89 `803b09e6` 15 files, #90 `7b9c675a` 4 files, #91 `cc694f2c` 3 files; all draft, all unmerged |
| 0.2 | Confirm production untouched by this work | VERIFIED | production deployment list: newest READY = `19473c0d`; no security/design/connector head deployed |
| 0.3 | Inventory of known blockers | VERIFIED | See `MASTER_PLAN.md` §Blockers: dev database, Vercel bypass key, GitHub `workflow` scope, Supabase admin token |

## Stage 1 — PR #91 security release readiness

| ID | Task | Status | Evidence |
|---|---|---|---|
| 1.1 | Cache headers on every response | VERIFIED | on-the-wire `private, no-store, max-age=0, must-revalidate` + `pragma: no-cache` + `x-robots-tag: noindex, nofollow` for 200/401/500 |
| 1.2 | Separate restore-ready backup from redacted export | VERIFIED | full = `restoreReady: true` with hashes; redacted = `restoreReady: false`, 9 column spellings -> `[redacted]` |
| 1.3 | No driver text in errors | VERIFIED | 500 body is `{error, requestId}`; driver message logged once server-side |
| 1.4 | No row data in logs on success | VERIFIED | `console.log/warn/error` all called 0 times on a 200 |
| 1.5 | Restore actually restores | VERIFIED | full export -> empty Postgres -> `bcrypt.compare(original, restored) === true`, row counts intact |
| 1.6 | Redacted export cannot restore logins | VERIFIED | same restore on redacted export: comparison fails |
| 1.7 | Refusal logging without secrets | VERIFIED | one JSON line `{ts, route, result, status, reason, requestId}`; token absent, not even truncated |
| 1.8 | Live verification on Vercel Preview | BLOCKED | preview returns 302 `Protected by Vercel Authentication`; bypass cannot be created by API (`protectionBypass` rejected on v6/v8/v9/v10, `/protection-bypass` 404) |
| 1.9 | Merge authorization | WAITING_APPROVAL | owner decision pending |

## Stage 2 — Production health verification

| ID | Task | Status | Evidence |
|---|---|---|---|
| 2.1 | Static routes and auth providers | VERIFIED | `/`, `/login`, `/api/auth/providers` 200 (last production sweep) |
| 2.2 | Admin routes refuse anonymous callers | VERIFIED | `/api/admin/backup` 401 without token, 405 on POST |
| 2.3 | Request-level log review for unauthorised access | BLOCKED | Vercel exposes build events only to this token and no log drain is configured, so past requests are not reviewable |

## Stage 3 — Isolated development database

| ID | Task | Status | Evidence |
|---|---|---|---|
| 3.1 | Create a free isolated dev database | BLOCKED | Supabase admin token returns 401 `JWT could not be decoded`; free project quota exhausted; Postgres ports 5432/6543 blocked from this sandbox |
| 3.2 | Fall back to CI-run migration against a dev database | BLOCKED | GitHub token lacks the `workflow` scope (workflow file create -> 404) |
| 3.3 | Verify schema/RLS/isolation on a real Postgres engine | VERIFIED (engine, not server) | PGlite: 5 tables, 6 foreign keys, indexes, RLS refuses non-owner role, cross-tenant read refused. Not a substitute for Supabase |

## Stage 4 — Tenant isolation and Migration 0027

| ID | Task | Status | Evidence |
|---|---|---|---|
| 4.1 | Forward migration applies cleanly | VERIFIED | PGlite: five tables present after apply |
| 4.2 | Rollback is exact | VERIFIED | up -> down -> previous table set restored, `User`/`Organization` rows unchanged, re-apply works, no-op on a database that never had 0027 |
| 4.3 | Two live tenants prove isolation | BLOCKED | needs a dev database and two accounts (Stage 3) |
| 4.4 | Apply 0027 to production | NOT_STARTED (forbidden) | owner instruction: do not apply |
| 4.5 | Approvals refuse an unattributed decision | VERIFIED | empty/whitespace decider -> `unauthorized: decided_by_required`, row stays `pending`, no audit row |

## Stage 5 — Authentication

| ID | Task | Status | Evidence |
|---|---|---|---|
| 5.1 | Password sign-in is throttled | IMPLEMENTED_NOT_DEPLOYED | PR #93 `14fb70e`: three windows (account+address 5, account 20, address 100 failures / 15 min), 29 tests, 5 mutations killed |
| 5.2 | Shared counter store across instances | IMPLEMENTED_NOT_DEPLOYED | Postgres store verified on PGlite: two store objects over one database enforce one limit. Default store is in-memory = per-instance only |
| 5.3 | Shared store active in production | BLOCKED | needs `lib/db/migrations/pending/auth_throttle.sql` applied + `AUTH_THROTTLE_STORE=postgres`; both are production changes awaiting approval. The postgres.js hand-off has not run against a server |
| 5.4 | 429 + Retry-After for a locked caller | IMPLEMENTED_NOT_DEPLOYED | route wrapper test: 429, `retry-after` 1..900, handler not reached |
| 5.5 | Password-reset requests are throttled | IMPLEMENTED_NOT_DEPLOYED | 3/hour per mailbox, 10/hour per address, same "sent" answer |
| 5.6 | Registration does not disclose existing accounts | NOT_STARTED | `register` returns `user_exists`; fixing it needs an email-verification flow (product decision) |
| 5.7 | Sign-in exercised end to end on a deployed build | BLOCKED | preview has no database and is behind deployment protection |
| 5.8 | Google OAuth verified live | NOT_STARTED | untouched; provider is configured in production, no callback was exercised in this work |

## Stage 6 — Backend API foundation

| ID | Task | Status | Evidence |
|---|---|---|---|
| 6.1 | Unauthenticated sweep of all 65 route handlers | VERIFIED | production, GET, no session: 45×307, 12×405, 5×401, 1×403, 2×200 (`/api/auth/session` = `null`, `/api/guest-quota` public). Zero responses with user, organisation, file or credential fields |
| 6.2 | `/dashboard/studio` reachable without a session | VERIFIED (public by design, not a vulnerability) | prerendered static HTML (`x-nextjs-prerender: 1`), 0 UUIDs, 0 credential keywords, only `support@zooka-ai.com`; the component makes no network call, stores a draft in the visitor's own localStorage, and states that it generates nothing. The job studio is `/workspace/studio` (307 without a session) |
| 6.3 | Exempt routes authenticate themselves | VERIFIED (code read) | signature, bearer key, shared secret or session in each of the 16 exempt handlers |
| 6.4 | Id-taking routes scope by organisation | VERIFIED (code read) | documents, votes, leads, files, studio projects, media jobs, suggestions, admin overview/users all filter on `organizationId` |
| 6.5 | API calls get 401 JSON instead of a redirect to HTML | IMPLEMENTED_NOT_DEPLOYED | PR #94 `4616c23`, 10 tests, 3 mutations killed |
| 6.6 | Agent bearer keys can reach `/api/agents/*` | IMPLEMENTED_NOT_DEPLOYED | production today: 307 to /login with a bearer header on status/registry/tasks/heartbeat. Fixed in PR #94 |
| 6.7 | `/api/base44/agent` leaks upstream error text | IMPLEMENTED_NOT_DEPLOYED | PR #94: client gets `{error, requestId}` |
| 6.8 | Request ids on every proxied response | IMPLEMENTED_NOT_DEPLOYED | PR #94; handlers do not log the id yet |
| 6.9 | Schema validation on the 21 handlers that read JSON without one | NOT_STARTED | all are behind authentication; next slice |
| 6.10 | Commander HTTP decision endpoint | NOT_STARTED | needs a database to verify the executor link |

## CI

| ID | Observation | Classification | Evidence |
|---|---|---|---|
| CI.1 | Combined status `failure` seconds after a push | Baseline, not a regression, not preview configuration | status history of every commit, `main` included, starts with `Vercel – chatbot: failure "Account is blocked."` and is replaced by `success` when the deployment completes |
| CI.2 | Vercel team billing | Needs owner attention | team API reports `billing.status: overdue` (plan pro). No block flag is set today |
| CI.3 | `blog_db_missing_connection_string` in preview build logs | Preview configuration | 4 occurrences in every preview build (all five branches), 0 on `main`'s production build; the error is caught, 121/121 pages generate. Preview has no `DATABASE_URL` by design |
| CI.4 | Build of PR #93 and PR #94 | VERIFIED | `Compiled successfully`, 121/121 static pages, READY. Runtime behaviour on preview not exercised |

## Stage 7-9 — Commander engine, approvals, frontend

| ID | Task | Status | Evidence |
|---|---|---|---|
| 7.1 | Approval engine (accept/reject/expire/duplicate/unknown/audit) | IMPLEMENTED_NOT_DEPLOYED | `lib/agents/approvals.ts`, engine tests green |
| 7.2 | Audit trail of decisions | IMPLEMENTED_NOT_DEPLOYED | `AgentDecision` rows asserted after each decision |
| 9.1 | Commander UI showing only real states | NOT_STARTED | cannot show real states without Stage 3; a static mock is forbidden by the owner's rule |

## Stage 12-14 — Website, design, studio

| ID | Task | Status | Evidence |
|---|---|---|---|
| 12.1 | Public pages audit | NOT_STARTED | `/compare` and `/solutions` returned 404 in the last sweep |
| 14.1 | Design tokens (colour/type/logical spacing/RTL) | IMPLEMENTED_NOT_DEPLOYED | PR #90 draft, 4 tests, not imported by any page |
| 14.2 | Apply tokens to a preview page | NOT_STARTED | must not change production identity |

## Stage 16 — Live Browser

| ID | Task | Status | Evidence |
|---|---|---|---|
| 16.1 | Architecture and cost review | VERIFIED (document) | `docs/live-browser-architecture.md` |
| 16.2 | Implementation | NOT_STARTED | no paid provider enabled, no spend |

## Stage 21 — Database isolation and Commander safety (15-16 Nov 2026)

Branch `feat/commander-tenant-scope`, PR #95, head `5bea188`. Draft. No migration
applied anywhere, no merge, no deployment, no billing or secret change.

| ID | Task | Status | Evidence |
|---|---|---|---|
| 21.1 | Engine can carry RLS claims | VERIFIED | PGlite reports `PostgreSQL 18.6 on wasm3`; roles, `SET ROLE`, `ENABLE`/`FORCE ROW LEVEL SECURITY`, `WITH CHECK` and custom GUCs (local and session) all exercised by real SQL in `tests/unit/commander-rls-policies.test.ts` |
| 21.2 | RLS enabled and forced on 5 Commander tables | IMPLEMENTED_NOT_DEPLOYED | migration `pending/0030`; assertions 1-2 read `pg_tables.rowsecurity` and `pg_class.relforcerowsecurity` |
| 21.3 | Request role cannot bypass RLS | IMPLEMENTED_NOT_DEPLOYED | `zooka_app` NOLOGIN NOSUPERUSER NOBYPASSRLS, asserted from `pg_roles`; the migration self-check raises if any attribute is wrong |
| 21.4 | Cross-tenant read, insert, update, delete | VERIFIED (policy level) | A sees only A and B only B; cross INSERT raises; moving a row into another tenant raises on `WITH CHECK`; DELETE matches nothing outside the tenant |
| 21.5 | Missing or invalid tenant context | VERIFIED | empty, `''`, wrong case and `' or 1=1 --` all return zero rows (fail closed) |
| 21.6 | Pooled-connection leak | VERIFIED | session-scoped (`is_local=false`) context is inherited by the next request and is asserted as the failure mode; transaction-local dies at `COMMIT`; outside a transaction it fails closed instead of falling back to all rows |
| 21.7 | Tenant GUC is caller-asserted | LIMITATION (documented) | anything with SQL on the connection can `set_config` any workspace. The policy guards a missing predicate, not an attacker holding SQL. Trust rests on route code resolving the organisation from the session |
| 21.8 | Application connection is a superuser | BLOCKER (documented) | `DATABASE_URL` authenticates as `postgres`, a superuser, which ignores RLS even with `FORCE`. Policies are a precondition; connecting as `zooka_app` is the fix and is a deployment decision |
| 21.9 | Migrations 0027-0030 in order | VERIFIED (isolated) | six cases: fresh chain, out-of-order refusal, legacy rows quarantined as `unclaimed`, duplicate addresses stopping 0029 before its index, interrupted 0028 resumed and re-run, full rollback that keeps rows and can be re-applied |
| 21.10 | `reportTask` could settle cancelled work | FIXED | no status guard: a cancelled task could be flipped to completed by the agent mid-run and a finished result rewritten. Restricted to open states; allowing terminal states again fails two tests |
| 21.11 | Commander concurrency | VERIFIED | 16 cases: double claim (one winner, loser told), approve vs reject (one decision sticks), cross-tenant decide/claim/cancel/report all null, cancellation during execution, duplicate completion report is inert, retry from `failed` allowed |
| 21.12 | Chat cost safety | VERIFIED | per-field caps plus a 60k-character conversation budget; 200 messages x 2000 chars was ~400k characters with every field legal. Payload ceiling 2MB before parsing |
| 21.13 | BACKUP_TOKEN rotation | PREPARED_NOT_EXECUTED | plan only; no rotation, no secret change |
| 21.14 | Vercel billing | BLOCKER (recorded) | team on `pro` with `billing.status = overdue`. Not paid, not changed |

## Stage 42 — Directive #033: schedule lifecycle and launch dashboard (16 Nov 2026)

PR #95 `9ca89a1`, PR #92 this entry. Both Draft. No production change, no migration applied, no purchase.

| ID | Task | Status | Evidence |
|---|---|---|---|
| 42.1 | Schedule create / list / get / edit / delete | VERIFIED | added to existing `lib/agents/schedule.ts`; 10 PostgreSQL tests |
| 42.2 | Unparseable cron refused before storage | VERIFIED | `invalid_cron`, asserted at store and endpoint level |
| 42.3 | Never-firing expression refused before storage | VERIFIED | `cron_never_fires` via `nextRunAfter`, same function the pass uses |
| 42.4 | Unknown timezone refused | VERIFIED | `invalid_timezone` |
| 42.5 | Cadence or timezone edit retimes the next run | VERIFIED | hourly → daily lands at 04:00 Dubai, asserted |
| 42.6 | Title-only edit leaves the next run alone | VERIFIED | retimed only when cadence or zone sent |
| 42.7 | Delete removes the schedule, keeps history | VERIFIED | completed task survives deletion, asserted |
| 42.8 | Next-run preview from the scheduler's engine | VERIFIED | `/api/agents/schedules/preview`; no second parser in the browser |
| 42.9 | Real controls on /workspace/schedules | VERIFIED (build) | compiled route; pause/resume, edit, delete-with-confirmation, per-schedule history |
| 42.10 | Asia/Dubai default timezone | VERIFIED | default in store, API and UI select |
| 42.11 | Authorization: member cannot write | VERIFIED | 403 at POST and at DELETE |
| 42.12 | Cross-tenant: 404 not 403 | VERIFIED | another workspace's schedule id returns 404 |
| 42.13 | Launch dashboard shows persisted states | VERIFIED (build) | `/workspace/launch`, reads GET /api/agents/launch, shows gates and dependencies |
| 42.14 | No control marks a launch step complete | MAINTAINED | no customer-facing route can advance a step |
| 42.15 | Agent management UI (milestone 006) | NOT IMPLEMENTED | no page built |
| 42.16 | Browser acceptance of any new page | UNTESTED | build-verified only; no deployed session exercised |
| 42.17 | Full gates, twice | VERIFIED | 610 passed / 6 skipped, 77 files, identical both runs; tsc 0; build compiled |

**Blocker carried forward:** Docker still absent, so milestone 027 acceptance remains unprovable
here. Registrar actions remain unexercised (sandbox egress blocked by Namecheap).

## Stage 41 — Directive #031 phase 1: the launch plan becomes reachable (16 Nov 2026)

PR #95 `119e72a`, PR #92 this entry. Both Draft. No production change, no migration applied, no purchase.

| ID | Task | Status | Evidence |
|---|---|---|---|
| 41.1 | Authenticated launch endpoint | VERIFIED | POST/GET `/api/agents/launch`; 8 route tests |
| 41.2 | Plan persisted per tenant | VERIFIED | `AgentLaunchPlan`, tenant policy in the 0030 shape, down file |
| 41.3 | Nothing born completed | VERIFIED | fresh plan holds zero COMPLETED steps, asserted directly |
| 41.4 | Completion blocked by unfinished dependency | VERIFIED | `setStepState` returns `dependency_not_complete:...` |
| 41.5 | Plan status derived, not stored | VERIFIED | summary cannot disagree with steps; completed only when every step is |
| 41.6 | Approval steps flagged before they are due | VERIFIED | `AWAITING_APPROVAL` set at creation |
| 41.7 | Customer steps carry their reason | VERIFIED | `BLOCKED` with the provider-identity gate text |
| 41.8 | Cross-tenant read and write refused | VERIFIED | other workspace gets `null`, 404 on the route, and cannot advance a step |
| 41.9 | Chat tool registry | VERIFIED | `createBusinessLaunchPlan`, `readBusinessLaunchPlan` wired into the chat tool set |
| 41.10 | No completion tool exists | MAINTAINED | no route or tool advances a step; a model cannot invent done |
| 41.11 | Store resolves inside the tenant transaction | VERIFIED | same lazy proxy as the Commander; shared connection only when nothing published |
| 41.12 | Schedule deletion / cancellation | NOT IMPLEMENTED | pause and resume exist; delete does not |
| 41.13 | Schedule and agent management UI | NOT IMPLEMENTED | no controls built |
| 41.14 | Full gates, twice | VERIFIED | 584 passed / 6 skipped, 76 files, identical both runs; tsc 0; build compiled |

**Reader note:** the commander-concurrency failures cited in this directive were root-caused
in stage 39: twelve test files pinned an explicit migration list that predated 0038, so the
schema they built lacked the columns the ORM declares. Fixed in the fixtures, not the
assertions.

## Stage 40 — Directive #029 phase C, first slice: launch plan and domain truth (16 Nov 2026)

PR #95 `d0ba954`, PR #92 this entry. Both Draft. No production change, no purchase, no credential used.

| ID | Task | Status | Evidence |
|---|---|---|---|
| 40.1 | Deterministic launch plan from a brief | VERIFIED | `buildLaunchPlan`; 15 tests; same brief gives the same plan |
| 40.2 | Purchase is never an agent step | VERIFIED | domain purchase, publish and ads are `owner: approval`, listed in `blockedOnApproval` |
| 40.3 | Customer-only steps stated as such | VERIFIED | email (provider identity check), social creation (CAPTCHA/OTP), Search Console |
| 40.4 | Connectivity changes the plan | VERIFIED | DNS is an agent step with a registrar connected, a customer step without one |
| 40.5 | Existing accounts connected, not created | VERIFIED | `existingAccounts` yields `social-connect`, and `social-create` disappears |
| 40.6 | No unsupported promise in copy | VERIFIED | search step states no ranking is promised; no fabricated prices |
| 40.7 | Dependency ordering | VERIFIED | `startableOrder` places every step after its dependencies; search before purchase, site before publish |
| 40.8 | Domain availability, three states | VERIFIED | RDAP first, DNS second, `unknown` when neither answers |
| 40.9 | Live registry check | VERIFIED | `zooka-ai.com` reads taken against the real registry, read-only, zero cost |
| 40.10 | Domain check reachable by a customer | NOT IMPLEMENTED | module only: no HTTP route, not in the chat tool list |
| 40.11 | Website generation, email provisioning, social onboarding | NOT IMPLEMENTED | planned steps, not code |
| 40.12 | Gates | VERIFIED | 565 passed / 6 skipped, 74 files, tsc 0 errors, build compiled |

**Reader note:** this directive cited PR #95 head `762bf8a`; the branch had advanced past it
through stages 38 and 39, so work continued from `be9f89d` rather than from the cited hash.

## Stage 39 — Directive #029 phases A and B: recurring schedules, agent model config (16 Nov 2026)

PR #95 `be9f89d` (implementation), PR #92 this entry. Both Draft. No production deployment, no production migration, no merge, no paid service, no credential published.

| ID | Task | Status | Evidence |
|---|---|---|---|
| 39.1 | Cron engine, five fields, vixie semantics | VERIFIED | 18 unit tests; day-of-month OR day-of-week when both restricted |
| 39.2 | Timezone maths via Intl, no new dependency | VERIFIED | 09:00 Asia/Dubai resolves to 05:00Z; monthly and weekday cases checked |
| 39.3 | DST spring gap | VERIFIED | 01:30 on 2026-03-29 London does not exist and is skipped to 30 Mar |
| 39.4 | DST fall-back | FIXED THEN VERIFIED | first pass picked the second 01:30; now resolves to the first (00:30Z) |
| 39.5 | Exactly one task per slot | VERIFIED | two schedulers racing, two workspaces: one task each, `created` total 2 |
| 39.6 | nextRunAt advances | FIXED THEN VERIFIED | equality guard never matched (microseconds); hourly → 03:00Z, 30-min → 02:30Z |
| 39.7 | No duplicate on repeat polling | VERIFIED | created 0, row counts unchanged |
| 39.8 | Worker executes a scheduled task | VERIFIED | completed in 394 ms, live GitHub evidence persisted |
| 39.9 | Pause / resume | VERIFIED | paused creates nothing; resume recomputes from now, never replays missed slots |
| 39.10 | Malformed cron refused | VERIFIED | 12 malformed expressions rejected; API refuses before storage |
| 39.11 | Never-matching expression | FIXED THEN VERIFIED | disables itself instead of appearing live with no next run |
| 39.12 | Cross-workspace schedule access | VERIFIED | `setScheduleEnabled` for another workspace returns null |
| 39.13 | Migration 0038 applied / reversed / re-applied on isolated PG | VERIFIED | idempotent; every column on an existing table nullable; `.down.sql` present |
| 39.14 | Agent model selection validation | VERIFIED | 20 tests: pair required, provider allow-list, model-id charset, credential report |
| 39.15 | Interactive chat provider unchanged | MAINTAINED | chat gateway path untouched; divergence documented, not silently unified |
| 39.16 | Schedule and model UI controls | NOT IMPLEMENTED | parameters 4 not delivered; engine and API only |
| 39.17 | Docker / container acceptance | BLOCKED | Docker still absent |
| 39.18 | Full gates | VERIFIED | 543 passed / 4 skipped, 72 files, tsc 0 errors, build compiled |

**Not claimed:** a schedule has never been created through the UI, because there is no UI for it yet. No production schedule exists.

**Still open:** `pending/0037` remains the production deployment prerequisite; migration 0037 and 0038 are both unapplied in Production.

## Stage 38 — Milestone 027: first successful tool execution, agent configuration (16 Nov 2026)

PR #95 implementation, PR #92 this entry. Both Draft. No production deployment, no production migration, no merge, no paid service, no credential published.

| ID | Task | Status | Evidence |
|---|---|---|---|
| 38.1 | Successful authorized tool run | VERIFIED | task completed in 308 ms; evidence persisted: `zooka-ai/chatbot: branch main, public, 7944 KB, last push 2026-11-16T01:52:08Z` |
| 38.2 | Root cause of `bad_repo_name` | FIXED | scheduler passed `{repo}`, worker passed nothing; one payload source now (`lib/agents/tool-payload.ts`), 5 tests |
| 38.3 | Credential refusal behaves | VERIFIED | ANSI-C-quoted token refused as `credential_malformed` instead of being sent |
| 38.4 | No duplicate execution | VERIFIED | one execution row; a re-poll of two workers added none |
| 38.5 | Correct UI status | VERIFIED (derivation) | `describeExecution` maps that execution to `completed` with evidence verified; 18 tests |
| 38.6 | Tenant isolation | VERIFIED (code + suite) | `updateAgentConfig` filters `organizationId` inside the UPDATE; isolation suite green |
| 38.7 | Agent rename / disable / scopes / environment | VERIFIED (API) | PATCH `/api/agents/registry`, owner/admin only; 12 pure validation tests |
| 38.8 | Agent config UI | NOT IMPLEMENTED | stated, not claimed |
| 38.9 | Recurring schedules + cron + Asia/Dubai | NOT IMPLEMENTED | needs columns (`scheduledFor`, `nextRunAt`, `schedule`, `timezone`, `model`) and a pending migration; no UI will be built over a schema that cannot store it |
| 38.10 | Per-agent model selection | NOT IMPLEMENTED | same schema prerequisite |
| 38.11 | Chat and worker provider consistency | ANSWERED, NOT UNIFIED | chat uses the AI SDK gateway; worker execution uses `MODEL_PROVIDER`. Two real paths, documented in PROVIDERS.md |
| 38.12 | Quality gates | VERIFIED | 510 passed / 4 skipped, 70 files, `tsc --noEmit` 0 errors, `pnpm run build` compiled |
| 38.13 | Docker / container acceptance | BLOCKED | Docker still absent from this environment |

**Still open, unchanged:** `pending/0037` blocks production deployment of code reading `User.emailVerifiedAt`; backups not exercised against a container stack.

## Stage 37 — Milestone 026: task detail, evidence and progress in chat (16 Nov 2026)

PR #95 implementation, PR #92 this entry. Both Draft. No production deployment, no production migration, no merge, no paid service.

| ID | Task | Status | Evidence |
|---|---|---|---|
| 37.1 | Preserve uncommitted progress work | VERIFIED | `git status` inspected first; `execution-progress.ts` and its tests committed, nothing reset |
| 37.2 | Progress contract complete | VERIFIED | 18 tests over nine stages including timed_out and blocked, plus the polling rules |
| 37.3 | Task detail consumes it | VERIFIED | `TaskExecutionPanel` reads `GET /api/agents/tasks/[id]`; stage, next step, attempts, timing, evidence, error |
| 37.4 | Evidence shown with its verification state | VERIFIED | evidence present/absent, tool, reference, summary; "no evidence recorded" is a first-class state |
| 37.5 | Retry and cancellation controls | VERIFIED (logic) | buttons gate on `progress.canRetry` / `canCancel`; they call the existing retry and cancel endpoints, which enforce owner/admin and tenant scope |
| 37.6 | No fabricated progress | VERIFIED | no percentage and no progress bar anywhere; grep confirms |
| 37.7 | Chat surface | VERIFIED (wiring) | `ExecutionProgressCard` renders for createExecutionTask / getExecutionStatus tool results and polls until terminal |
| 37.8 | One source of truth across surfaces | VERIFIED | both surfaces call the same endpoint; the chat sentence is produced by the server |
| 37.9 | Client/server boundary respected | FIXED | first build failed because a client component imported `server-only`; helpers split into `execution-stage.ts` rather than weakening the guard |
| 37.10 | Stale type assumption removed | FIXED | `part.type` compared against values absent from the generated union; now an explicit narrow |
| 37.11 | Quality gates | VERIFIED | 492 passed / 4 skipped across 68 files, `tsc --noEmit` 0 errors, `pnpm run build` compiled |
| 37.12 | Browser verification | BLOCKED | no session available and hosted Preview remains protected; nothing here is claimed as seen working |

**Release prerequisite unchanged:** `pending/0037` must be applied and verified on production before code selecting `User.emailVerifiedAt` is deployed there.

**Still open:** self-hosted images unbuilt (no Docker in this environment), backups not exercised against a container stack, and no successful tool run end-to-end (needs repository credentials that should not be created for a smoke test).

## Stage 36 — Directive #026: execution UX truth, and a self-hosting package (16 Nov 2026)

PR #95 head `02dfca4`, PR #92 this entry. Both Draft, unmerged. No production deployment, no production migration, no merge, no paid service, no credential disclosed.

| ID | Task | Status | Evidence |
|---|---|---|---|
| 36.1 | Uncommitted progress work preserved | VERIFIED | `lib/agents/execution-progress.ts` and `task-detail.ts` committed, nothing reset |
| 36.2 | Progress covers all eight states | VERIFIED | queued, running, awaiting approval, completed, failed, cancelled, timed out, blocked, plus stalled; 15 tests assert the wording, not only the stage |
| 36.3 | Never invents progress | VERIFIED | completed without evidence is labelled unverified; expired lease is `stalled`, not running or failed |
| 36.4 | Real data on every surface | VERIFIED | `buildTaskDetail` is the single shape for chat, task page and history; route `GET /api/agents/tasks/[id]` |
| 36.5 | Tenant isolation on the new route | VERIFIED | tenant scope wrapper; 404 for another workspace's task so existence is not leaked |
| 36.6 | Docker images | WRITTEN, NOT BUILT | `deploy/docker/Dockerfile` targets web/worker/scheduler/migrate; Docker is not installed in this sandbox |
| 36.7 | Compose and Coolify | WRITTEN, PARSED | both compose files parse; Coolify variant publishes no host ports |
| 36.8 | Provider replaceability | VERIFIED | database, storage (local/S3/MinIO/blob), models (openai-compatible/ollama/gateway/anthropic/google), alerts; 24 tests |
| 36.9 | Vendor dependencies reduced | PARTIAL | storage and model calls no longer require a vendor SDK; `docs/selfhosting/PROVIDERS.md` states the two that remain (Vercel Blob optional, AI SDK gateway for interactive chat) |
| 36.10 | No arbitrary execution caps | VERIFIED | every ceiling is an env variable; config test proves `WORKER_CONCURRENCY=64` and `SCHEDULER_GLOBAL_LIMIT=500` are accepted |
| 36.11 | Migration runner | VERIFIED | 38 migrations on empty database, `failed={}`, rerun skipped 38; production hosts refused unless explicitly allowed |
| 36.12 | Worker executes | VERIFIED | claimed and ran a task, recorded an execution row, graceful SIGTERM with `shutdown_complete` |
| 36.13 | Autoscaling safety | VERIFIED | 20 tasks, 4 concurrent workers, 20 executions, 20 distinct tasks, 0 duplicates, 0 wedged |
| 36.14 | Two defects found by running it | FIXED | pre-claim defeated `claimTask` (queue stuck on running); invented an `updatedAt` column; race-losing workers were mislabelled blocked |
| 36.15 | Monitoring | VERIFIED | `/api/health`, owner-scoped `/api/agents/health` with 503 on critical, `healthcheck.ts` (15ms), JSON logs per event |
| 36.16 | Backups and recovery | WRITTEN, NOT RUN AGAINST A CONTAINER | `deploy/scripts/backup.sh` verifies its own dump; `restore.sh` refuses a non-empty target |
| 36.17 | Documentation | DONE | `docs/selfhosting/{INSTALL,ARCHITECTURE,OPERATIONS,PROVIDERS}.md` + `deploy/coolify/README.md` |
| 36.18 | Quality gates | VERIFIED | 489 passed / 4 skipped across 68 files, `tsc --noEmit` 0 errors, `pnpm run build` compiled |
| 36.19 | Production unchanged | VERIFIED | no deploy, no production migration; `0037` still pending by policy |

**Release prerequisite, unchanged:** `pending/0037` must be applied and verified on production before any code that selects `User.emailVerifiedAt` is deployed there.

**Untested, stated plainly:** the images were never built (no Docker in this environment), so `docker compose up` itself is unproven; backups were not exercised against a running container stack; the end-to-end positive path (a tool that succeeds) needs repository credentials that were deliberately not created for a smoke test, so every execution in the isolation run ended `failed: bad_repo_name` - the claim, lease, execution, evidence and status path is proven, the successful tool result is not.

## Stage 34 — Milestone 24 closed: six failures explained, migrations rounded out (16 Nov 2026)

PR #95 head `1ec780e`, PR #92 this entry. Both Draft, unmerged. No production schema change, no feature deployment, no production migration, no paid resource, no billing change, no credential disclosed.

| ID | Task | Status | Evidence |
|---|---|---|---|
| 34.1 | Uncommitted work preserved | VERIFIED | Inspected tree before touching it; nothing reset, cleaned or rebased |
| 34.2 | Six failures named | VERIFIED | `agent-health.test.ts`: three reads failed with "permission denied for table AgentExecution", one returned `ok` where `warn` was expected; the set varied between runs |
| 34.3 | Each file alone | VERIFIED | The health file passed 7/7 on its own, which ruled out the code under test |
| 34.4 | Root cause | VERIFIED | One shared database, plus suites that delete `SchedulerRun`/`AgentExecution` rows and rewrite `TENANT_RLS_ENABLED` and `DATABASE_URL_TENANT` in `process.env` without restoring them |
| 34.5 | Fix, not silenced | VERIFIED | Files serialised once DB suites are enabled; health suite given its own database and made to clear the flag it sets. No assertion relaxed |
| 34.6 | Stability | VERIFIED | 446 passed twice consecutively across 63 files, plus two further green runs during diagnosis |
| 34.7 | `Chat.deletedAt` | VERIFIED | `pending/0036`; type `timestamp`, nullable, so no table rewrite; up/down/up round-tripped |
| 34.8 | `User.emailVerifiedAt` | VERIFIED | `pending/0037`; backfilled 1 of 2 rows on a production-shaped table, down preserved both rows and the source column, re-up idempotent |
| 34.9 | Rollback procedures | DONE | `0036.down.sql` and `0037.down.sql`, each stating its consequence rather than just its SQL |
| 34.10 | ORM compatibility | VERIFIED | `migration-schema-parity.test.ts` asserts every ORM table and column exists in a migration-built database; passes with zero gaps |
| 34.11 | Recovery validation | VERIFIED | Fresh schema, live 854KB backup: 1,875 rows, 14 tables, counts identical to the previous run, 0 orphaned foreign keys, 277/277 bcrypt hashes |
| 34.12 | Legacy exclusions | DOCUMENTED | `User` name/image/emailVerified, `Organization` slug/ownerId/plan/deletedAt, `Document` embedding — reported per table, never silently dropped |
| 34.13 | Alerting verified, disabled | VERIFIED | 10 tests over cooldown, escalation, recovery, scheduler inactivity, leases, backlog and failure bursts; `deriveAlerts`/`planNotifications` have no caller outside tests, so nothing can send |
| 34.14 | Health monitoring | VERIFIED | 22 tests including 401, 403, 503 mapping, a 50-task backlog, stalled scheduler and missing scheduler history |
| 34.15 | Quality gates | VERIFIED | `tsc --noEmit` 0 errors, 446 passed / 4 skipped, `pnpm run build` exit 0 |

**Release prerequisite, unchanged and deliberate:** `pending/0037` must be applied and verified on production *before* this branch's code is deployed, because the ORM selects `User.emailVerifiedAt` and production carries `emailVerified`. Deploying first would break the first read of that column. It is not applied here because production migrations need explicit owner approval, which has not been given.

**Also still open:** no isolated Preview database (Supabase quota consumed, management token 401 on every endpoint, no alternative provider credential), so `TENANT_RLS_ENABLED` has never been exercised on a hosted database, and no browser session exists, so the health endpoint has never been called over HTTP by a signed-in user.

## Stage 33 — Restore proved, drift measured, and health that cannot be announced (16 Nov 2026)

PR #95 head `2a225e0`, PR #92 this entry. Draft. No merge, no production feature deployment, no production migration, no billing change, no paid resource, no secret exposed.

| ID | Task | Status | Evidence |
|---|---|---|---|
| 33.1 | Rotation still holds | VERIFIED | New credential accepted on 5432 and 6543; the retired one rejected |
| 33.2 | Production data intact | VERIFIED | 277 users, 299 messages, 60 chats, 277 organisations read directly |
| 33.3 | Auth endpoints | VERIFIED | `/api/auth/providers` 200, `/login` 200, `/api/auth/session` 200 |
| 33.4 | Backup available | VERIFIED | `GET /api/admin/backup` 200, 854,794 bytes |
| 33.5 | Non-destructive restore | VERIFIED | Schema exported from production into an isolated local database, then 1,853 rows loaded from the live backup artifact: User 277, Organization 277, OrganizationMember 277, Subscription 277, UsageEvent 361, Chat 60, Message_v2 299, Suggestion 25, every count equal to the dump |
| 33.6 | Restore integrity detail | VERIFIED | A bcrypt hash restored byte-for-byte (60 chars) and its email unchanged, so credentials survive a restore rather than merely the row count |
| 33.7 | Production untouched by the test | VERIFIED | Every write went to `zooka_restore_test` on 127.0.0.1; the production connection was used read-only for the schema export |
| 33.8 | **Schema drift, measured** | **FOUND** | Loading the backup into a schema built from the repository's own migrations failed on four columns production has and the migrations do not: `User.name`, `Organization.slug`, `Chat.deletedAt`, `Document.embedding`. So the migrations alone cannot rebuild production, and a real restore must come from production's own schema |
| 33.9 | Client-version trap | DOCUMENTED | `pg_dump 15` refuses a 17.6 server; the 17 client had to be installed from the PGDG repository before any export was possible. Anyone repeating this needs the matching client first |
| 33.10 | Execution health | DONE | `lib/agents/health.ts` + `GET /api/agents/health`, owner/admin only, inside the tenant scope, 503 on a critical verdict |
| 33.11 | Five signals, all derived from rows | DONE | Queue depth and oldest age, expired leases, failures in the last hour, last scheduler pass freshness and status, parked approvals |
| 33.12 | Honest unknowns | DONE | No scheduler pass ever reports that nothing can be dispatched; an expired lease is critical because the task is neither finished nor available |
| 33.13 | Health tests on real PostgreSQL | VERIFIED | 6 cases: fresh pass and empty queue, three-hour backlog quoting its age, lease expired five minutes ago, one failure warns versus six escalate, never-scheduled reported honestly, and one workspace's backlog never moving another's verdict |
| 33.14 | Suite, types, build | VERIFIED | 428 passed across 60 files, `tsc --noEmit` clean, `pnpm run build` exit 0 |

Two things remain blocked and unchanged: there is still no isolated Preview database (Supabase free quota consumed, management token 401 on every endpoint, no alternative provider credential) and Preview still has no Google client, so a browser acceptance session remains impossible without owner action.

## Stage 32 — Production credential rotated, and a domain correction (16 Nov 2026)

PR #95 (rotation hygiene, `19340f6`) and PR #92 (this entry). No merge. The only production change is the one the owner authorised and Phase 9 permits: a credential rotation plus the narrowly scoped configuration update and restart needed to keep the database reachable.

**Correction first, because it affects how every earlier entry reads.** The production domain is `zooka-ai.com`. The spelling `zoka-ai.com` used in earlier stages does not exist: RDAP returns 404, Google and Cloudflare both return NXDOMAIN, and Vercel answers `not_found` for that project domain. `zooka-ai.com` is registered (24 Nov 2025, expires 24 Nov 2035), verified in Vercel, and serves production on `dpl_GmbEtyYcUX`.

| ID | Task | Status | Evidence |
|---|---|---|---|
| 32.1 | Production health before any change | VERIFIED | `/` 200, `/login` 200, `/api/auth/providers` 200, `/workspace/agent` 307, `/api/agent` 405 |
| 32.2 | Backup readiness before rotation | VERIFIED | `GET /api/admin/backup` 200, 854,794 bytes, generated minutes before the change |
| 32.3 | Rotation mechanism | FOUND | Supabase pooler reachable on 5432 and 6543, so the role password could be changed without a dashboard session; the management token remains 401 |
| 32.4 | Credential rotated | DONE | `ALTER ROLE postgres WITH PASSWORD`, 48 generated characters, never printed and never written into a report |
| 32.5 | Old credential retired | VERIFIED | Rejected on both ports, re-tested after propagation |
| 32.6 | Dependent configuration | DONE | `DATABASE_URL` and `POSTGRES_URL` patched in Vercel, production scope only |
| 32.7 | Restart | DONE | Production redeployed `dpl_GmbEtyYcUX` READY; the live HTML reports that deployment id |
| 32.8 | Database connectivity after | VERIFIED | `POST /api/admin/migrate` 200 with `failed={}`, RLS 40 on / 0 off |
| 32.9 | Existing records intact | VERIFIED | Direct read: 277 users, 299 messages, 60 chats; nothing deleted or reset |
| 32.10 | Read and write operations | VERIFIED | Transactional write succeeded on the new credential |
| 32.11 | Backup connectivity after | VERIFIED | `GET /api/admin/backup` 200 at 854,794 bytes |
| 32.12 | Disk hygiene | DONE | The vault backup holding the retired value was deleted; no copy of it remains on disk |
| 32.13 | Rollback guard | ARMED, NOT USED | The script restored the previous password automatically if the Vercel update failed |
| 32.14 | Neither password in reporting | DONE | No value appears in any document, commit, or message |
| 32.15 | Suite, types, build | DONE | 421 passed across 59 files, `tsc --noEmit` clean, `pnpm run build` exit 0 with 126 pages |

Deliberately not done: no feature release to production, and no Vercel variable changed other than the two connection strings the rotation required.

## Stage 31 — The credential incident, and a Preview that cannot be provisioned yet (16 Nov 2026)

PR #95 head `c279d7f`, draft. No merge, no production deployment, no production migration, no billing change, no paid service, no credential exposed in this stage, no authentication bypassed.

| ID | Task | Status | Evidence |
|---|---|---|---|
| 31.1 | Incident opened, not minimised | DONE | `docs/engineering/SECURITY_INCIDENT_DB_CREDENTIAL.md` |
| 31.2 | Blast radius measured | VERIFIED | Byte-wise walk of the tree plus `git log --all -S`: present only in `vault.json` and `vault.json.bak-20261115-1707`; zero commits, zero repository files, zero chat replies |
| 31.3 | Cause identified in my own tooling | DONE | A 40-character truncation rule applied to a 32-character password; length-based redaction is not redaction |
| 31.4 | Behaviour changed | DONE | Values sourced from the credential store now become a fixed marker that discloses nothing, not even length |
| 31.5 | Rotation plan prepared | DONE, NOT EXECUTED | Four ordered steps with the owner performing the reset so the new value never enters a transcript, plus a named rollback |
| 31.6 | Dependent services mapped | DONE | `DATABASE_URL`/`POSTGRES_URL` on production, `/api/admin/migrate`, `/api/admin/backup`, Drizzle migrations; Preview holds no database credential at all |
| 31.7 | Post-rotation verification defined | DONE | migrate 200 with `failed={}`, backup 200 with non-zero users, route status checks, one real sign-in and one saved message |
| 31.8 | Approval requested, not assumed | DONE | Rotation is a production credential change plus a redeploy, so it waits for one explicit sentence |
| 31.9 | Preview database provisioning | BLOCKED | `SUPABASE_ACCESS_TOKEN` now answers 401 `JWT could not be decoded` on `/v1/projects` after answering 200 earlier the same day; one attempt, no retries, no auth workaround |
| 31.10 | Manual provisioning steps | DONE | Seven steps in `docs/engineering/PREVIEW_ENV.md`, free `zooka-preview` in `ap-southeast-1`, Preview-only scope for every variable |
| 31.11 | Least-privilege roles | DONE | `postgres` for migrations and selection only; `zooka_runtime` LOGIN/NOSUPERUSER/NOBYPASSRLS, member of nothing, owner of nothing |
| 31.12 | Migration ordering | VERIFIED | `0031` revokes every grant, so `0034`/`0035` must follow and `0035`'s grants are re-applied at the end |
| 31.13 | OAuth callback identified | DONE | `https://<preview-host>/api/auth/callback/google`, from NextAuth mounted at `app/(auth)/api/auth/[...nextauth]` |
| 31.14 | Preview OAuth truth | FOUND | `GOOGLE_LOGIN_CLIENT_ID`/`GOOGLE_LOGIN_CLIENT_SECRET` are not in the Preview scope, so Preview has no Google client at all: sign-in is impossible there today even with SSO out of the way |
| 31.15 | Production OAuth untouched | VERIFIED | No redirect URI and no production variable was modified in this stage |
| 31.16 | Browser acceptance | BLOCKED | Needs the database, the Preview Google client, and a decision on Vercel SSO or an alternate acceptance host |
| 31.17 | Suite, types, build | DONE | 421 passed across 59 files, `tsc --noEmit` clean, `pnpm run build` exit 0 with 126 pages |

Two things are now precise rather than vague: the disclosure reached one internal transcript and nothing else, and Preview sign-in fails for two independent reasons, the missing Google client being the one nobody had noticed.

## Stage 30 — An isolated Preview database: diagnosis, recipe, and the decision (16 Nov 2026)

PR #95 head `176108f`, draft. No merge, no production deployment, no production migration, no billing change, no paid resource, no secret exposed, no authentication bypassed.

| ID | Task | Status | Evidence |
|---|---|---|---|
| 30.1 | Is there an approved free database? | NO, and why | One database credential exists in the vault and it is the production pooler; no Neon/Railway/Turso credential anywhere |
| 30.2 | Can one be created from here? | BLOCKED | `GET /v1/projects` works (one project), `GET /v1/organizations` returns 401 `JWT could not be decoded`, so no org id for a create call |
| 30.3 | Provisioning runbook | DONE | `scripts/preview-db-provision.sh`, committed, idempotent, refuses production hosts, prints no secret |
| 30.4 | Migrations on a fresh database | VERIFIED | Seven files applied to a brand new database in the correct order, including the 0031-revokes-grants ordering trap |
| 30.5 | Restricted runtime role | VERIFIED | `PASS role is restricted` (no superuser, no bypassrls) |
| 30.6 | Tenant RLS enabled | VERIFIED | `PASS rls_on=5 rls_off=0` on the five Commander tables |
| 30.7 | Synthetic seed | DONE | Two workspaces, two agent identities, one task each; no production row, no real person |
| 30.8 | Cross-tenant read | VERIFIED | As `zooka_runtime`: A sees 1 task, B's task invisible to A, B sees its own |
| 30.9 | Cross-tenant write | VERIFIED | A's UPDATE against B's row returned `UPDATE 0`; B's task still `pending` |
| 30.10 | Suite against the new database | VERIFIED | 421 passed across 59 files, identical to the development cluster |
| 30.11 | Preview env variables | NOT SET, correctly | Nothing can be set before a connection string exists; preview still has none, so the scheduler stays 401/503 |
| 30.12 | Chat tools audit | DONE | Four Commander calls all tenant-scoped; workspace and canManage come from the session, not the body; document tools scope on (id, organizationId) |
| 30.13 | Browser acceptance | BLOCKED | Vercel SSO (302) plus a separate preview `AUTH_SECRET` and a Google redirect URI registered for `zoka-ai.com` only |
| 30.14 | Build and types | DONE | tsc clean, `pnpm run build` exit 0, 126 pages |

**Two owner decisions are needed, and they are independent.** First, one free database: create a Supabase project `zooka-preview` in `ap-southeast-1` and set its pooler string as `DATABASE_URL_TENANT` on Preview only, or a free Neon database, or a management token that can read organisations. Second, for the browser half: either register the preview domain as a Google OAuth redirect URI, or accept read-only browser acceptance against production instead.

The recipe is finished and proven, so the first decision costs ten minutes rather than a milestone.

## Stage 29 — Authenticated acceptance, and the read that was not scoped (16 Nov 2026)

PR #95 head `32046f7`, draft. No merge, no production deployment, no production migration, no billing change, no paid service, no secret exposed, no authentication bypassed.

| ID | Task | Status | Evidence |
|---|---|---|---|
| 29.1 | Preview inventory | DONE | 45 project variables, 7 preview-targeted, and none of them a database credential: `DATABASE_URL`/`POSTGRES_URL` are production-only |
| 29.2 | Scheduler protection in preview | VERIFIED | `SCHEDULER_TOKEN`, `DATABASE_URL_PLATFORM`, `DATABASE_URL_TENANT` all absent from preview, so the endpoint is 401 and then 503 by design |
| 29.3 | Preview authentication | BLOCKED (documented) | Every preview path answers 302 to `vercel.com/sso-api`; `AUTH_SECRET` is a separate preview value, so a production session cannot be replayed and none may be forged |
| 29.4 | Chat command → task | VERIFIED | Real tool call: `ok:true`, task `baa27f7c`, status `pending`, note "No agent has run it yet" |
| 29.5 | Task → scheduler | VERIFIED | Run `3af93266`, one task claimed under per-org 1 / global 2 / batch 1 |
| 29.6 | Scheduler → worker → GitHub | VERIFIED | Execution `d034bbc6`, tool `github_repo_inspect`, 199 ms, workspace credential |
| 29.7 | Stored evidence | VERIFIED | `evidenceRef: execution:d034bbc6…`, summary "zooka-ai/chatbot: branch main, public, 9868 KB, last push 2026-11-16T00:29:17Z" |
| 29.8 | User-visible result | VERIFIED | `getExecutionStatus` returned "Recorded as completed, with a verified tool execution behind it" |
| 29.9 | Execution history | VERIFIED | `listTasks` for the workspace shows the task completed with the same evidence |
| 29.10 | Member refused | DONE | The chat tool returns `ok:false` with an owner/admin message and no task id, and the queue stays empty |
| 29.11 | Owner/admin vs member vs agent | DONE | `canManage` admits owner and admin only; a member session and an agent key are both refused |
| 29.12 | Cross-tenant | DONE | Workspace A cannot see workspace B's queue in the acceptance test; the worker suite proves a foreign task answers `task_not_found` |
| 29.13 | Unauthorised repository | DONE | Installation tokens must list the repository, else `repo_not_in_installation` |
| 29.14 | Missing credentials | DONE | `not_connected` / `platform_credential_not_enabled`, never a silent platform fallback |
| 29.15 | Expired lease | DONE | Recovery closes the attempt `timed_out`, fails the task, and a stale worker cannot settle it |
| 29.16 | Cancelled execution | DONE | A mid-flight cancel outranks a successful tool result |
| 29.17 | Failed tool call | DONE | The task fails with the tool's error stored verbatim |
| 29.18 | Preview cron plan | DOCUMENTED, NOT ACTIVATED | `docs/engineering/SCHEDULER_PREVIEW_PLAN.md`: five steps, one task per hour ceiling, platform connection that refuses production hosts, and the honest gap that no alert is wired |
| 29.19 | Full suite | DONE | 421 passed across 59 files on PostgreSQL; 4 skipped are the opt-in live tests |
| 29.20 | Build | DONE | `pnpm run build` exit 0, 126 pages |

**The defect this stage found:** `getExecutionStatus` in the chat bridge read the execution report on the shared connection. Under enforced RLS that is a hard failure; in production, where RLS is off, it was an unscoped cross-tenant read inside the very file whose header claims every read goes through the tenant scope. It was found by driving the real tool against real PostgreSQL and watching the shared-connection guard throw, not by reading the code. Fixed by wrapping the call in the same scope as the task read.

Remaining blockers, stated plainly: authenticating on the preview is impossible without an owner decision, because Vercel SSO and a separate `AUTH_SECRET` both stand in front of it and neither may be bypassed; the preview has no database of its own, so nothing can run there end to end until one exists; no cron is configured in any environment; and no failure alert is sent when a pass fails.

Next milestone: a preview-only development database, so the authenticated journey can be exercised in a browser rather than only against PostgreSQL in the sandbox.

## Stage 28 — Scheduled, leased, tenant-credentialled (16 Nov 2026)

PR #95 head `8d0ae10`, draft. PR #92 carries this entry. No merge, no production deployment, no production migration, no billing change, no paid service, no credential exposed.

| ID | Task | Status | Evidence |
|---|---|---|---|
| 28.1 | Overlap impossible at the database | DONE | Session-scoped advisory lock `8135713` on a dedicated connection; a held-lock test proves the second pass returns `overlapping_run` and claims nothing |
| 28.2 | Atomic selection | DONE | Each task is claimed by the worker's conditional UPDATE on `status='pending'`, not by the selector |
| 28.3 | Per-organisation ceiling | DONE | `SCHEDULER_PER_ORG_LIMIT`; test queues three tasks for one workspace and asserts exactly one is taken |
| 28.4 | Global ceiling | DONE | `SCHEDULER_GLOBAL_LIMIT`; test queues two workspaces and asserts one attempt |
| 28.5 | Fair scheduling | DONE | One task per workspace per pass, oldest first; test asserts both organisations appear when one has three tasks and the other one |
| 28.6 | Bounded batch | DONE | `SCHEDULER_BATCH_SIZE`, capacity computed from attempts actually running |
| 28.7 | Explicit failure handling | DONE | An unauthorised tool is refused per task, the pass still finishes, and `SchedulerRun` records it |
| 28.8 | Observability | DONE | `SchedulerRun` row per pass with claimed/succeeded/failed/skipped/reclaimed counts and a JSON detail |
| 28.9 | Deployment-compatible scheduling | DONE | HTTP endpoint, no persistent process assumed; hosting requirements documented in `docs/engineering/SCHEDULER.md` |
| 28.10 | Execution lease | DONE | `leaseExpiresAt` + heartbeat every 30 s while the tool works |
| 28.11 | Lease expiration and recovery | DONE | Sweeper closes expired attempts `timed_out` and their tasks `failed`; test asserts `error='lease_expired'` and task `failed`, never completed |
| 28.12 | Lease ownership before completion | DONE | The worker asks for a heartbeat before claiming success; a null answer returns `lease_lost` and claims nothing |
| 28.13 | Expired worker cannot overwrite | DONE | Closure is conditional on a live lease; test has a stale worker try to close an expired attempt and asserts the row is untouched |
| 28.14 | Idempotency keys | DONE | `idempotencyKey = task:tool:attempt` with a unique partial index |
| 28.15 | Tenant-scoped credentials | DONE | Workspace connection read through the tenant handle; live run records `credentialSource: workspace` |
| 28.16 | Fail closed | DONE | Missing, malformed, unreadable and not-connected are distinct refusals; a malformed value is refused and left exactly as stored (test reads it back) |
| 28.17 | No fallback to the platform token | DONE | A workspace with no connection returns `platform_credential_not_enabled` when shared credentials are off; test asserts it |
| 28.18 | Repository authorisation | DONE | Installation tokens must list the repository; a listing that omits it refuses with `repo_not_in_installation` |
| 28.19 | No secrets in evidence or responses | DONE | Token never stored, evidence redacted, `SchedulerRun.detail` carries ids and counts only |
| 28.20 | Least privilege in migration 0035 | DONE | `zooka_runtime` gets SELECT/INSERT/UPDATE on `SchedulerRun` and SELECT only on `integration_connection`; DELETE on executions stays denied |
| 28.21 | Second read-only tool | DONE | `vercel_deployment_inspect`: five GETs, no deployment, rollback, environment or billing path |
| 28.22 | Real end-to-end | VERIFIED | task `9ef159f7` → scheduler run `524041f6` → execution `ebbe981e` → `completed` in 280 ms; second task read the Vercel project, 5 deployments, latest READY |
| 28.23 | Full suite | DONE | 414 passed across 58 files with PostgreSQL; 3 skipped are the opt-in live tests |
| 28.24 | Build | DONE | `pnpm run build` exit 0, 126 pages |

Two hardening gaps were found during the security review and fixed before commit: completion was not lease-verified (a late worker could have settled an attempt recovery already owned), and the scheduler token was compared with `===` (a byte-by-byte oracle). Both now have tests.

Remaining blockers, stated plainly: no cron calls the endpoint yet, so nothing runs on a cadence; the scheduler needs `DATABASE_URL_PLATFORM`, a cross-tenant credential that must be created and approved before any deployment uses it; one tool per provider exists (GitHub, Vercel) and there is no scheduler UI; and nobody has driven the endpoint with a real agent key outside these tests.

Next milestone: authenticated browser acceptance and the complete chat-to-execution user journey.

## Stage 27 — The first execution worker (16 Nov 2026)

PR #95 head `27ff1f07`, draft. No merge, no production deployment, no production migration, no billing change, no paid service, no credential exposed.

| ID | Task | Status | Evidence |
|---|---|---|---|
| 27.1 | Atomic claim | DONE | Conditional UPDATE on `status='pending'`; approval-gated tasks refused at claim unless their own organisation approved |
| 27.2 | Duplicate execution impossible | DONE | Partial unique index `(taskId) where status='running'` plus a pre-insert check; the second worker writes nothing and the count stays at one |
| 27.3 | Organisation isolation | DONE | Another tenant's task answers `task_not_found`; the suite runs on `zooka_runtime` with the shared connection stubbed to throw, so an escape fails loudly |
| 27.4 | Tool authorisation | DONE | Unknown or non-read-only tool is refused before the claim; the task is left `pending` |
| 27.5 | Timeouts | DONE | Per-tool `timeoutMs`, abort signal, attempt recorded `timed_out`, task `failed` |
| 27.6 | Cancellation | DONE | The task is re-read after the tool returns; a mid-flight cancel outranks the result and the task stays `cancelled` |
| 27.7 | Retry ceiling | DONE | Attempts counted before claiming; at three the task becomes `blocked`, never retried for ever |
| 27.8 | Completion requires a verified result | DONE | Completion is written only after `ok: true`; a failure stores the tool's error verbatim; a report that changes no row is recorded as cancelled, not completed |
| 27.9 | Evidence | DONE | `AgentExecution` records task, organisation, agent, tool, attempt, start, finish, duration, status, result summary, evidence reference and error |
| 27.10 | No credentials in evidence | DONE | Every outgoing string passes `redact`; a leaking file is fed through the real tool and the stored row contains `[redacted]`, not the token |
| 27.11 | Audit integrity | DONE | `zooka_runtime` is denied DELETE on `AgentExecution`; the denial is asserted, not assumed |
| 27.12 | One real read-only tool | DONE | `github_repo_inspect`: four GETs, allowlisted repository, no writes of any kind |
| 27.13 | LIVE execution | VERIFIED | Real call through the worker against api.github.com: task `5f52aedb`, execution `c9a13067`, `completed`, "zooka-ai/chatbot: branch main, public, 9868 KB, last push 2026-11-16T00:04:43Z; read 1 file(s)" |
| 27.14 | Chat reflects execution | DONE | `getExecutionStatus` returns the last attempt and says "unverified" if a task says completed without a successful execution behind it |
| 27.15 | Migration 0034 | DONE (pending) | `AgentExecution`, RLS policy on `organizationId`, partial unique index, grants minus DELETE |
| 27.16 | Preview deployment | READY | `dpl_9oX6U4FPbF` for the chatbot project on `27ff1f07`; the `zeker-app` twin of the same commit is CANCELED, which is long-standing and expected |
| 27.17 | `pnpm run build` | DONE | Compile succeeds, 125 pages, exit 0 |

Numbers: 401 tests across 57 files with PostgreSQL (1 skipped: the opt-in live call), tsc clean.

Two defects found, both recorded in `docs/engineering/EXECUTION_WORKER.md`: drizzle wraps driver errors so the SQLSTATE check did not fire, and a failed statement aborts the tenant transaction, making recovery impossible; and `GITHUB_ACCESS_TOKEN` in the shared env file is ANSI-C quoted (`$'gho_...'`), so the literal `$'` reached the header and every request answered 401 until the value was read from offset 3. The worker prefers `WORKER_GITHUB_TOKEN` so a quoted value in the shared file cannot break it again.

Remaining blockers: no scheduler calls the worker, so nothing runs on its own; one tool exists; nobody has operated the endpoint with a real agent key; the browser procedure remains unexecuted.

Next autonomous task: a scheduler that claims and runs pending tasks on a cadence, with a per-workspace concurrency ceiling, plus a second read-only tool so the registry is not a single point of failure.

## Stage 26 — Atomic decisions, validated migrations, and the chain traced (16 Nov 2026)

PR #95 head `7d9a957f`, draft. No merge, no production deployment, no migration applied to production, no billing change, no paid service, no secret rotated.

| ID | Task | Status | Evidence |
|---|---|---|---|
| 26.1 | Approval + audit in one transaction | DONE | `decideApproval` validates, transitions and inserts the audit row inside `db.transaction`. The insert runs only after the conditional UPDATE returned a row, so a losing race, another tenant or a missing row writes nothing |
| 26.2 | Rollback proof | VERIFIED | The test occupies the unique slot first, then decides: the call rejects and the approval is still `pending` with `decidedBy` null. Nothing half-committed |
| 26.3 | No duplicate decision records | DONE | Migration `pending/0033` adds `approvalId` plus a partial unique index; a second decision on the same approval returns null and the count stays at one |
| 26.4 | Route no longer writes history | DONE | The HTTP route reports the result only; its tests now assert `recordDecision` is called zero times, which is what prevents the duplicate |
| 26.5 | Tenant handle defect | FOUND and FIXED | The Commander handle is a Proxy that returned `transaction` unbound, so `db.transaction()` produced nothing at all and the first atomic attempt silently wrote no rows. Methods now bind to the handle they resolve from |
| 26.6 | Migration 0032 + 0033 validated | DONE | Forward apply idempotent on the isolated instance; index is `(organizationId, createdAt DESC, id DESC)`; the unique index is partial; 0027–0031 remain compatible; both roll back and re-apply in development only |
| 26.7 | Query performance | MEASURED | 50,000 rows over 20 workspaces, deep page inside a 2,500-row workspace: 0.142 ms via Index Scan with the index, 1.679 ms without it |
| 26.8 | Browser acceptance | PREPARED, NOT RUN | `docs/engineering/BROWSER_ACCEPTANCE_PROCEDURE.md`: three acceptable ways to obtain an authorised session, twelve steps with the evidence each needs, and the rule that a screenshot is not evidence of a database change. No bypass attempted |
| 26.9 | Chat to real work | DONE (partial chain) | `createExecutionTask`, `getExecutionStatus`, `listExecutionTasks` are wired into the chat toolset. No tool can complete, report or decide, so the model cannot fabricate a completion; replies carry the database's own status |
| 26.10 | Chain traced | DOCUMENTED | `docs/engineering/E2E_EXECUTION_TRACE.md`: links 1, 2, 3, 7 real and tested; link 4 exists with no engine; 6 and 8 half-built; link 5 (tool invocation by a claimed agent) missing |
| 26.11 | Preview deployment | READY | `dpl_71fctPUeDh` on `7d9a957f` |
| 26.12 | `pnpm run build` | DONE | Compile succeeds, 124 pages, exit 0 |

Numbers: 388 tests across 56 files with PostgreSQL, tsc clean.

Remaining risks: nothing claims and executes a queued task, so the platform can record intent and refuse to fake completion but cannot yet act on its own; the reason rule and audit write are inside the domain but a caller outside a tenant transaction still writes with the shared handle; the browser procedure has never been executed.

Next autonomous task: build the queue runner (claim by conditional UPDATE, execute one allow-listed tool, report a stored artefact), then re-run the browser procedure against a session the owner provides.

## Stage 25 — Domain reason rule, Load More, and a measured index (16 Nov 2026)

PR #95 head `b5e10fe5`, draft. No merge, no production deployment, no migration applied, no billing change, no paid service, no secret rotated.

| ID | Task | Status | Evidence |
|---|---|---|---|
| 25.1 | Reason rule in the domain | DONE | `decideApproval` throws `ApprovalDecisionError` for `reason_required`, `reason_too_short` and `reason_too_long` before touching a row; an approval still needs no reason |
| 25.2 | Route stays a second layer | DONE | The route validates first, then maps the domain refusal onto the same 400 shape, so both layers agree and neither is decorative |
| 25.3 | Refusals do not consume the approval | VERIFIED | Test reads the row after four refused attempts and finds it still `pending` |
| 25.4 | Direct domain tests | DONE | `approval-domain.test.ts`, 7 tests calling `decideApproval` with no HTTP: empty, blank and short reasons, over-long reason, approval without reason, two concurrent decisions with exactly one winner, another tenant receiving `null`, and a missing row answering identically |
| 25.5 | Load More | DONE | Real cursor, rows appended by id so a duplicate cannot be shown twice, `aria-busy` and `aria-label` on the control, an `aria-live` count, an explicit end-of-history line instead of a dead button, failures routed to the existing error region |
| 25.6 | Bilingual labels | DONE | `paging` block in both dictionaries; the existing parity test would fail if one drifted |
| 25.7 | Legacy API compatibility | VERIFIED | Paging is opt-in through `paginate=1`; a caller that does not ask keeps the exact response it had, and the tests that assert the old `listTasks` arguments still pass |
| 25.8 | Index-friendly keyset | DONE | Boundary is a plain column comparison against a bound parameter; migration `pending/0032` adds `(organizationId, createdAt DESC, id DESC)` matching the ORDER BY exactly. Cursor carries the database's microsecond timestamp text, so no function is applied to the column |
| 25.9 | Benchmark | MEASURED | 50,000 rows over 20 workspaces, deep page inside one 2,500-row workspace, EXPLAIN ANALYZE: new 0.603 ms / 51 buffers, old 1.285 ms / 99 buffers. Without the new index: new 1.047 ms / 99, old 1.313 ms / 99. Single-tenant 50,000-row table (worst case for any index): old 19.5 ms, new 14.7 ms |
| 25.10 | Preview deployment | READY | `dpl_3SoAi69EJa` on `b5e10fe5`, `chatbot-q3t963f3h-zooka-ai1.vercel.app` |
| 25.11 | Browser verification | BLOCKED | `GET /workspace/commander` on the preview returns 302 into Vercel authentication and there is no authorized session; the directive forbids bypassing it, so no click-through was performed and none is claimed |
| 25.12 | `pnpm run build` | DONE | Prebuild placeholder guard passes, compile succeeds, 124 pages generated, exit 0 |

Numbers: 379 tests across 55 files with PostgreSQL, tsc clean.

Remaining risks: the console has never been operated by a human; the domain writes no decision history, so a caller that bypasses the route validates a reason but records no audit row; paging performance for a single workspace beyond ~100,000 rows is unmeasured.

Next autonomous task: move decision-history writing into the domain alongside the validation, then run the console against a preview with an authorized session.

## Stage 24 — Approval semantics, the Vercel cause, and keyset history (16 Nov 2026)

PR #95 head `31d7da54`, draft. No merge, no deployment to production, no migration applied, no billing change, no paid resource.

| ID | Task | Status | Evidence |
|---|---|---|---|
| 24.1 | Rejection must carry a reason | DONE | `app/api/agents/approvals/[id]/route.ts`: empty, whitespace-only and under-four-character reasons refused with `reason_required` / `reason_too_short`; over 1000 characters refused with `reason_too_long` rather than truncated. Validated on the server, before any write |
| 24.2 | Backward compatibility | VERIFIED | The legacy `note` field still satisfies the rule; approval without a reason still succeeds, so an existing client keeps working. Unexpected fields are still rejected outright |
| 24.3 | Decisions become audit history | DONE | A successful decision writes `APPROVAL_APPROVED` / `APPROVAL_REJECTED` with its reason, and only after the conditional UPDATE won, so a decision that lost a race writes nothing |
| 24.4 | Vercel build failure, root cause | FOUND and FIXED | Read from the platform, not guessed: `prebuild` runs `scripts/check-placeholders.mjs`, which flagged the array literal `[TENANT_SETTING]` in `lib/db/tenant.ts` as unresolved marketing copy. Locally I had run `next build` directly, which skips `prebuild`; Vercel runs `pnpm run build`. Fixed by binding the array to a name. Deployment `dpl_E6KzVtKwDb` on `31d7da54` is READY |
| 24.5 | Evidence for the failure | RECORDED | `dpl_4tdFUmm9sc6ubV6Wu4nNVipsNaZR` (be2566d9) and `dpl_3nGMAvNxACjqjkqjYtgC87nsNXxy` (f97365f) both ERROR with the same prebuild message; the credential was read from vault storage, never from chat |
| 24.6 | Keyset pagination | DONE | `listTaskPage` pages on (createdAt, id) descending, tenant-filtered, one extra row to know whether a next page exists. Unit-tested cursor codec; the route returns `invalid_cursor` for anything it did not issue |
| 24.7 | Pagination correctness defect | FIXED | Cursor carried milliseconds while PostgreSQL stores microseconds, so every row inside the boundary millisecond was dropped (105 rows read as 25). Both sides now use one millisecond bucket. Found by the paging test, not by reasoning |
| 24.8 | Paging tests | DONE | 105 rows read as 6 complete pages with no repeat and no gap; total ordering under five identical timestamps; a cursor from another tenant returns nothing; the last page offers no next cursor |
| 24.9 | Approval tests | DONE | 15 route tests: empty, blank and short reasons, over-long reason, legacy note, approval without reason, no session, agent key, member, duplicate decision, cross-tenant, body-supplied tenant, malformed id, forged cursor |
| 24.10 | Test-infrastructure defect | FIXED | Two real-database suites were given different advisory lock ids and corrupted each other's fixtures in parallel; they now share one lock |
| 24.11 | Browser verification of the interface | NOT DONE | Preview deployment protection plus a session cookie bound to the production domain means there is no authenticated browser session available to this agent. Reported as unverified rather than claimed |
| 24.12 | Interface pagination control | NOT DONE | The API pages correctly and returns `nextCursor`; the console still reads its first 100 rows and has no "load more" control |

Numbers: 367 tests without a database, 372 with one, tsc clean, prebuild guard PASS, `next build` compiles, Vercel READY on `31d7da54`.

Remaining risks: the rejection rule is enforced at the route but `decideApproval` itself accepts any reason, so a second caller of that function would bypass it; the console has still never been operated by a human; `date_trunc` costs the createdAt index and that trade should be revisited if history reaches millions of rows.

Next autonomous task: move the reason rule into `decideApproval` so the domain and not only the route enforces it, wire "load more" into the console, then operate the console against a preview with a real session.

## Stage 23 — Commander execution history and approval console (16 Nov 2026)

Branch `feat/commander-tenant-scope`, PR #95, draft, head `be2566d9`. No merge, no deployment, no production migration, no billing change.

| ID | Task | Status | Evidence |
|---|---|---|---|
| 23.1 | Execution history screen | DONE | `app/(chat)/workspace/commander/page.tsx` reads listTasks, listApprovals, listDecisions and listAgents server-side as the signed-in workspace. Columns: task, status, agent identity, created, started, finished, evidence or error, per-task recorded events |
| 23.2 | Real retry, not a button | DONE | `retryTask` in `lib/agents/command-center.ts`: conditional transition from failed or cancelled only, clears owner and evidence and timestamps, refuses a rejected approval, writes a RETRY decision. Route POST /api/agents/tasks/[id]/retry |
| 23.3 | Cancellation history | DONE | `cancelTask` writes a CANCELLED decision with reason and actor, so a cancelled task explains itself later |
| 23.4 | Approval center | DONE | Pending list with task, reason, requester and time; approve and reject behind a confirmation that names what approval authorises; per-action loading and error states |
| 23.5 | Authorisation in the interface | DONE | `components/commander/permissions.ts` is the single source (canOffer for create, cancel, retry, decide). Buttons render only when it returns true, and the tests import the same function |
| 23.6 | An agent cannot approve its own action | VERIFIED | The route uses canManage, which narrows the caller to an owner, so the agent branch is a type error; the test asserts 403 with zero domain calls |
| 23.7 | Arabic RTL and English LTR | DONE | One dictionary per language in `components/commander/copy.ts`; a parity test asserts identical key paths; direction from the language cookie; logical CSS |
| 23.8 | Accessibility | DONE | Scoped table headers, labelled inputs, one aria-live region for outcomes, aria-busy per action, tablist and tabpanel roles |
| 23.9 | Reachable navigation | DONE | Commander entry added beside the operations agent in the sidebar |
| 23.10 | Interface unit tests | DONE | `commander-ui.test.ts`, 14 tests: permission matrix, bilingual parity, status and error coverage, and the retry route refusing no-session, agent key, member, body-supplied tenant, bad id and missing reason before any write |
| 23.11 | PostgreSQL tests | DONE | `commander-retry-real-pg.test.ts`, 8 tests on real PostgreSQL 15.19 inside the tenant transaction: the transition, the history row, completed and running refusal, a rejected approval that never executed, the defensive rejected-row guard, cross-tenant refusal, and no scope means no execution |
| 23.12 | Test-infrastructure defect fixed | DONE | The three real-database suites truncated the same tables in parallel and corrupted each other. They now take a PostgreSQL advisory lock and run in turn. Found by running the whole suite, not by reading it |
| 23.13 | Production build | BLOCKED (sandbox) | `next build` fails here because node_modules is a symlink leaving the project root: a Turbopack resolution error, not a code error. The Vercel build on this PR is the authority |
| 23.14 | Browser click-through | NOT_DONE | No authenticated session is available to the sandbox agent, so interaction is verified by types, build and tests rather than by hand |

Numbers: 331 tests without a database, 352 with one, tsc clean.

Remaining risks: the console has never been operated by a human; an approval can still be decided with an empty reason because the server does not require one; the history has no pagination beyond 100 rows; and the rejected-approval retry guard is defence in depth rather than a reachable path, since a pending approval already blocks claiming.

Next autonomous task: require a reason server-side for approvals, add pagination and a status filter to the history, then operate the console against the preview deployment once a browser session exists.

## Stage 22 — Preview database and the route-to-policy path (16 Nov 2026)

Branch `feat/commander-tenant-scope`, PR #95, draft. No production change, no merge,
no billing, no paid resource.

| ID | Task | Status | Evidence |
|---|---|---|---|
| 22.1 | Free isolated PostgreSQL for real connection tests | DONE (local, ephemeral) | PostgreSQL 15.19 installed in the sandbox: own cluster, own database `zooka_tenant`, own password, port 55432 on 127.0.0.1. No production credentials, no production data, no cost |
| 22.2 | Hosted free preview database | BLOCKED (owner decision) | Supabase free limit is spent (two active projects per user) and no Neon credential exists in the workspace. Needs the owner to authorise an account or provide credentials |
| 22.3 | Migrations 0027-0031 on a real server | VERIFIED | All four applied cleanly in order; RLS `true` and `force=true` on all five tables, owner `postgres`, `zooka_runtime` LOGIN and not superuser/BYPASSRLS |
| 22.4 | Runtime role privileges, real server | VERIFIED | `current_user = zooka_runtime`; not superuser, not BYPASSRLS, no CREATEDB/CREATEROLE, owns zero relations, `has_schema_privilege('public','CREATE') = false`; `ALTER TABLE ... DISABLE RLS` refused |
| 22.5 | RLS actually enforced, not just present | VERIFIED | Same connection: no context → 0 rows; context A → 1 row; `''`, `ORG-A` and a non-uuid each → 0 rows |
| 22.6 | Two independent connections at once | VERIFIED | Two pools, two overlapping transactions with `pg_sleep`, each sees only its own tenant and reports its own `current_setting` |
| 22.7 | Pool reuse | VERIFIED | Same max-1 pool: after COMMIT the next transaction sees 0 rows and `current_setting` is empty |
| 22.8 | Transaction rollback | VERIFIED | A write followed by an error leaves no row (checked with the owner connection) |
| 22.9 | Cross-tenant writes | VERIFIED | INSERT into another tenant and moving a row out of the tenant both raise `row-level security`; neither writes an invisible row |
| 22.10 | Superuser bypass, demonstrated | VERIFIED | The same policies and data are fully visible to the `postgres` connection, which is why `runInTenantTransaction` refuses a privileged role before any work |
| 22.11 | Routes actually use the tenant path | FIXED | The hole: all 12 Commander routes used the shared connection, so no policy was ever evaluated for a real request. `lib/db/tenant-context.ts` (ALS) + lazy Proxy handle in `command-center` + `withCommanderTenant` on all 12 routes |
| 22.12 | The wiring cannot silently regress | VERIFIED | `commander-route-scope-guard.test.ts` reads every route and fails if a handler is exported unwrapped or a new route skips the wrapper (13 assertions) |
| 22.13 | End-to-end chain, real server | VERIFIED | `commander-tenant-end-to-end.test.ts`: create in A visible to A and not to B; B cannot claim A's task with its id; the shared connection is a throwing stub so an escape fails loudly; full create→claim→report inside one transaction with the row confirmed by the owner connection; refused organisation opens no transaction |
| 22.14 | UI integration, execution history panel | NOT_STARTED | No dashboard reads Commander state; the data layer it would need is in place and tested |

Honest limits: the local cluster is ephemeral and part of the sandbox, so it proves
behaviour but is not a deployment target; the hosted preview database at 22.2 is
still the blocker for a durable preview. Priority 4 items (execution history,
retry policy, UI) remain open.

## Stage 17-20 — Billing, QA, release

| ID | Task | Status |
|---|---|---|
| 17.1 | Billing sandbox verification | NOT_STARTED |
| 18.1 | End-to-end QA | NOT_STARTED |
| 19.1 | Release preparation | NOT_STARTED |
| 20.1 | Owner approval | WAITING_APPROVAL |

## Stage 21 — Milestone 006: agent permissions (16 Nov 2026)

An agent is now a principal with permissions rather than a key with a name.

| ID | Task | Status | Evidence |
|---|---|---|---|
| 21.1 | Tool assignment storage | VERIFIED | migration `0040` (`allowedTools`, `instructions`), nullable so existing rows stay valid; applied to an isolated database |
| 21.2 | Refuse unassigned tools before claiming | VERIFIED | `tests/unit/worker-authorization.test.ts` — 8 tests; the refusal precedes any queue read, so nothing is claimed |
| 21.3 | Fail closed on malformed permissions | VERIFIED | string, object and empty-array values all refuse |
| 21.4 | Disabled agent refused | VERIFIED | `authenticateAgent` filters `status = 'active'` |
| 21.5 | Cross-tenant refusal | VERIFIED | update scoped by `organizationId`; a foreign id returns null, not a modification |
| 21.6 | New agents start with no tools | VERIFIED | `registerAgent` writes `allowedTools: []`; NULL is reported as `legacy_unrestricted` |
| 21.7 | Model configuration persists | VERIFIED | provider and model id written; previously accepted and silently dropped |
| 21.8 | Model configuration operational | **NOT_MET** | no LLM-backed worker tool exists, so execution never consumes the selection; the UI labels it "stored, not used by execution yet" |
| 21.9 | Browser acceptance of the three workspace pages | **BLOCKED** | server ran on an isolated database; the login form sets no session cookie, and a checked cookie minted with the deployment secret still yields `null` from `/api/auth/session`; no page was clicked |
| 21.10 | Quality gates | VERIFIED | 643 passed / 6 skipped / 649, 80 files, twice serially; `tsc` 0 errors; build compiled; migration parity 2/2 |

Notes. One intermittent failure appeared only under parallel file execution
(`schedule.test.ts`, "two passes in the same second"), 1 in 3 parallel runs and 18/18
five times isolated; the assertion was not weakened and the suites run serially here.
Migrations 0036–0040 remain unapplied to Production. PR #95 head `c5a7e128`. No
production deployment, no purchases, no third-party actions.

### Stage 21 addendum — browser acceptance unblocked (16 Nov 2026)

| ID | Task | Status | Evidence |
|---|---|---|---|
| 21.9 | Browser acceptance of the three workspace pages | **VERIFIED** | 8/8 checks; real credentials through the app's own Auth.js endpoint; records created in the UI still listed after reload |
| 21.11 | Agents page crash on a legacy tool list | FIXED | `allowedTools === null` guard fell through for an omitted field; now shape-tested |
| 21.12 | Email/password sign-in on the server-action path | OPEN | action sets csrf + callback-url but not session-token; canonical callback route sets it; unproven in production |

Why acceptance had been blocked: the app runs in production mode, so Auth.js issues
`__Secure-authjs.session-token` with `Secure`, and a browser discards it from an `http://`
origin. Instrumenting `authorize()` proved the lookup and the bcrypt comparison both succeeded,
so the failure was cookie policy, never credentials. `scripts/acceptance/tls-proxy.mjs`
terminates TLS locally; no auth code was modified and no session was minted.

Screenshots: `acceptance/agents.png`, `acceptance/schedules.png`, `acceptance/launch.png`.
Gates after the fixes: 643 passed / 6 skipped twice serially, `tsc` 0 errors, production build
compiled. PR #95 head `a41cf72`. Production untouched; migrations 0036–0040 still unapplied.

### Stage 21 addendum 2 — the login is proven through the form (16 Nov 2026)

| ID | Task | Status | Evidence |
|---|---|---|---|
| 21.12 | Email/password sign-in on the server-action path | **CLOSED — not a product defect** | Next.js replied `Invalid Server Actions request` because the acceptance proxy rewrote the `Host` header, so `Origin` no longer matched. With the host preserved the form sets `__Secure-authjs.session-token` and lands on `/` |
| 21.13 | Sign-in proven through the real form | VERIFIED | 9/9 acceptance; the previous run used the callback endpoint, this one fills and submits the form |
| 21.14 | Trace capture | VERIFIED | `acceptance/trace.zip` |
| 21.15 | Credentials hardcoded in the acceptance script | FIXED | script now requires `ACCEPT_EMAIL` / `ACCEPT_PASSWORD` and exits 2 without them |
| 21.16 | Scratch probe carrying the local test password | REMOVED, DISCLOSED | committed accidentally in `c5a7e128`; test-only credential for a throwaway local database; treat that password as burnt |
| 21.17 | New agents default to no tools | VERIFIED | regression test reads the stored row; four browser-created agents all hold `[]` |
| 21.18 | Disabled agent cannot execute | VERIFIED | key authenticates, identity disabled, same key then returns null, against real PostgreSQL |

Correction of record: addendum 1 listed 21.12 as an open product anomaly on the strength of a
browser-only observation. That inference was wrong. The action is rejected before it executes, and
only under the rewritten host. No authentication code was changed in this milestone.

Gates: 646 passed / 6 skipped / 652 twice serially, `tsc` 0 errors, production build compiled.
PR #95 head `7857e57`. Production untouched; migrations 0036–0040 still unapplied.

---

## Milestone 007 / Phase 1 — Workspace projects and the action catalog

Date 16 November 2026. Branch `feat/commander-tenant-scope`, PR #95 head `f2bcf90`.

| ID | Task | Status | Evidence |
|---|---|---|---|
| 22.01 | `AgentProject` table, migration 0041 | VERIFIED | 18/18 checks on a database rebuilt from all 42 migrations: objects, three FKs, unique name per workspace, RLS enabled, policy present, runtime grants, A/B isolation, no-context sees nothing, cross-tenant write refused, rollback, re-apply |
| 22.02 | Link to the hosted-site `Project` table | VERIFIED, CONDITIONAL BY DESIGN | foreign key created only where that table exists; `tests/unit/workspace-project-schema.test.ts` covers both shapes, `ON DELETE SET NULL` confirmed via `confdeltype = 'n'` |
| 22.03 | Project store, tenant scoped | VERIFIED | 17 tests on real PostgreSQL: isolation, name uniqueness, rename collision, unknown status, empty patch, cross-tenant edit `not_found`, delete vs archive, assignment refusing a foreign agent |
| 22.04 | Deleting a project that holds work | VERIFIED | archives instead of deleting, `keptTasks = 1`, task still readable afterwards |
| 22.05 | Action catalog contract | VERIFIED | 20 tests; `executable` derived from the worker's tool registry, an unimplemented tool cannot be offered |
| 22.06 | Input validation | VERIFIED | missing field named (`missing_repo`), undeclared key refused, declared pattern enforced, whitespace trimmed, blank required value treated as missing |
| 22.07 | Execution planner refusals | VERIFIED | not executable, tool not assigned, inactive agent, plan without agent runs, exhausted allowance — each before a task exists |
| 22.08 | Duplicate submissions | VERIFIED | identical request inside five minutes returns the queued task with `deduplicated: true`; finished task not reused; older identical request is new work |
| 22.09 | Route authorization | VERIFIED | 401 without a session and without reaching the runner, 403 for a member, 400 for an unknown body key, organisation taken from the caller |
| 22.10 | `/workspace/projects`, `/workspace/actions` | VERIFIED IN BROWSER | 17/17 acceptance with a real form login; project persisted across reload, catalogue Arabic-first, detail rollups at zero rather than a placeholder |
| 22.11 | Execution withheld when no agent holds the tool | VERIFIED | run control disabled in the browser for an agent created with the zero-tool default |
| 22.12 | Regression: 30 tests across two suites | ROOT CAUSE FOUND AND FIXED | eleven PGlite harnesses built their schema from a migration list ending at 0040, so the ORM declared `projectId` against a database without it; each chain now applies 0041 and the runtime-role grant is conditional because those harnesses never create `zooka_runtime` |
| 22.13 | Running an action to a stored result in the browser | UNTESTED | needs an agent holding a tool plus a live provider credential; proven only to the queued-task boundary |
| 22.14 | Per-project membership | NOT BUILT | access follows the workspace role; no member list exists |

Gates: 707 passed / 6 skipped / 713 in 87 files, run twice serially with identical counts, `tsc`
0 errors, production build compiled, migration 0041 verified 18/18, browser acceptance 17/17.
Production untouched: no deployment, no production migration, no merge, both PRs still draft.

---

## Milestone 008 — real action execution lifecycle

Date 16 November 2026. PR #95 head `9d310f0`. Local production build over TLS, real form login,
real agent bearer key, real outbound HTTP.

| ID | Task | Status | Evidence |
|---|---|---|---|
| 23.01 | Worker reachable over HTTP with an agent key | FIXED — was a real defect | proxy.ts redirected every unauthenticated /api call to /login, so /api/agents/worker answered 307 and no queued task could be claimed; the proxy now admits agent-credential requests to the worker and heartbeat only, and both still refuse with 401 without a valid key |
| 23.02 | Task's own payload reaches the tool | FIXED — was a real defect | the route passed only the body, so a catalog-queued task ran with `{}` and the tool answered `Malformed repository name.`; the worker now defaults to the claimed task's payload, explicit body wins |
| 23.03 | Proof the inputs flow, not just that a row exists | VERIFIED | same action before/after: `Malformed repository name.` → `GitHub refused the metadata request (401).`, i.e. a real request carried the chosen repo |
| 23.04 | Full lifecycle through the customer interface | 11/14 checks | login → agent with one tool → project (201) → attach (200) → action queued (201, pending) → worker claims with its own key → execution row written → task left pending → page shows `Tasks (1)` and `Execution evidence (1)` → duplicate deduplicated → no cross-workspace execution |
| 23.05 | Persisted success | BLOCKED | api.github.com returned 401: the only GitHub credential here is a git credential the REST API rejects, and no workspace GitHub connection exists. No mock was substituted |
| 23.06 | Plan guard on a workspace with no subscription row | VERIFIED | runner refused `plan_does_not_include_agent_runs` before creating a task; a plan row was then added to the test database |
| 23.07 | Contract tests for the payload split | VERIFIED | `tests/unit/worker-payload-default.test.ts`, 3 tests: route never invents a payload, explicit body passes through, empty queue runs nothing |
| 23.08 | Directive #041 operations dashboard | NOT STARTED | capacity in this session, not a technical block |
| 23.09 | Directive #042 P2 browser isolation contract | NOT STARTED | same |
| 23.10 | Directive #042 P3 customer browser panel, P4 provider comparison | NOT STARTED | no infrastructure purchased, no provider activated |

Gates: 710 passed / 6 skipped / 716 in 88 files twice serially, `tsc` 0 errors, production build
compiled. No production deployment, no production migration, no merge, no purchase.

---

## Milestone 009 — first real customer result

Date 16 November 2026. PR #95 head `9790eea`. Local production build over TLS, real form login,
real agent key, real persisted result.

| ID | Task | Status | Evidence |
|---|---|---|---|
| 24.01 | An executable action that needs no external credential | DONE | `workspace_readiness_inspect`: five org-scoped SELECTs over the caller's own agents, projects, tasks, schedules and executions; no write, no network call |
| 24.02 | The catalog refuses a tool it does not know how to feed | WORKING AS DESIGNED | `actionPayload` threw `no payload mapping for tool workspace_readiness_inspect` until the mapping was added |
| 24.03 | Input validation trap | FIXED | the validator compiles patterns without the `u` flag, so `\p{L}` degraded into literal characters and rejected valid input; explicit range used and the reason recorded |
| 24.04 | Stale process misread as a code defect | NOTED | an old server still held port 3105 and answered with the previous build; `lsof` missed it, `fuser -k` cleared it |
| 24.05 | Tool correctness on real Postgres | VERIFIED | 6 tests: own-workspace counts (A sees 2 agents, never B's 3), honest needs-attention text, empty workspace reports zero, bad label refused, cancelled run refused, no row mutated |
| 24.06 | Full lifecycle through the customer surface | 14/14 | login → agent with one tool → project 201 → attach 200 → action 201 `pending` → worker claims with its own key → tool runs → task `completed` by the worker → page shows `Tasks (1)` and `Execution evidence (1)` → duplicate not requeued → zero cross-workspace executions |
| 24.07 | What the customer actually saw | VERIFIED | `تقرير الجاهزية — 7 agent(s) (7 active) · 13 project(s) · 9 task(s) (2 pending) · 7 execution(s)`, screenshot `acceptance/execution-project.png` |
| 24.08 | Proxy exception audit | VERIFIED | exact-path match on the worker and heartbeat endpoints only; both still answer 401 for an invalid, revoked or disabled agent key; all other `/api` paths still require a session |
| 24.09 | GitHub connection | BLOCKED | no workspace GitHub connection; the only credential here is a git credential the REST API refuses with 401 |
| 24.10 | "Create Project Document" action | NOT IMPLEMENTED | needs a tenant-scoped document store and a workspace viewer; the readiness report was the smaller honest first success |
| 24.11 | Browser isolation, human control, command center | NOT STARTED | needs a runtime provider decision from the owner; no paid infrastructure activated |

Gates: 716 passed / 6 skipped / 722 in 89 files twice serially, `tsc` 0 errors, production build
compiled. No production deployment, no production migration, no merge, no purchase.

---

## Milestone 010 — customer artifacts

Date 16 November 2026. PR #95 head `ecdbc4e`. Local production build over TLS, real form login,
real agent key, real stored document.

| ID | Task | Status | Evidence |
|---|---|---|---|
| 25.01 | Tenant-scoped document storage | DONE | `ProjectDocument` (0042): `organizationId`, cascade to `AgentProject`, task link, RLS tenant policy, partial unique index on `taskId` |
| 25.02 | Real document generation | DONE | deterministic sections from the customer's clauses; no model call, no invented content, stated in the footer |
| 25.03 | Persistent database records | VERIFIED | one row per run, 1,017 characters, `bytes` equal to stored length |
| 25.04 | Customer document viewer | DONE | server page `/workspace/documents/[id]`, reloads from the database |
| 25.05 | Download capability | VERIFIED | `?download=1` → `text/markdown`, `attachment`, filename sanitised, body length equal to stored |
| 25.06 | Project association | VERIFIED | listed on the project console and under `/api/workspace/projects/[id]/documents` |
| 25.07 | Agent execution evidence | VERIFIED | document names the task and agent that produced it; `taskId` matches the executed task |
| 25.08 | Access-control enforcement | VERIFIED | reads resolve through the caller's organization; unknown or foreign id → 404; a project from another workspace → `unknown_project` with no row written |
| 25.09 | Worker write gate | HARDENED | `internalWrite` AND `INTERNAL_WRITE_TOOLS` membership required; default stays refuse |
| 25.10 | Browser acceptance | 22/22 | queue → claim → execute → store → list → open → download → reload → 404 |
| 25.11 | Migration up/down | VERIFIED | scratch DB: up, verify table/index/policy/FK, down, up again; parity suite green |
| 25.12 | Browser isolation contract (#045 P2) | NOT STARTED | needs a runtime provider decision from the owner |
| 25.13 | Customer browser control (#045 P3) | NOT STARTED | deliberately not simulated without a runtime |
| 25.14 | Command center integration (#045 P4) | NOT STARTED | depends on P2/P3 |
| 25.15 | Natural-language router (#045 P5) | NOT STARTED | next candidate: it is the difference between a form and a conversation |
| 25.16 | Integration audit (#045 P6) | NO CHANGE | GitHub action still ends in an honest 401; no new credential exists |

Gates: 725 passed / 6 skipped / 731 in 90 files twice serially, `tsc` 0 errors, production build
compiled. No production deployment, no production migration, no merge, no purchase.

---

## Milestone 011 — acceptance closed, and the schema now means what it says

Date 16 November 2026. PR #95 head `65bc4e1`. Two workspaces, real form login, local production
build over TLS.

| ID | Task | Status | Evidence |
|---|---|---|---|
| 26.01 | Document created by the real worker | VERIFIED | `pending` → claimed with the agent's own key → execution `succeeded` → task `completed` by the worker |
| 26.02 | Persists in PostgreSQL | VERIFIED | 1,017 characters, `bytes` equal to stored length |
| 26.03 | Linked to the correct tenant and project | VERIFIED | `organizationId` + `projectId` + `taskId`, now enforced by a composite foreign key |
| 26.04 | Opens through the authenticated viewer | VERIFIED | `/workspace/documents/[id]` renders the stored body |
| 26.05 | Downloads successfully | VERIFIED | `text/markdown`, `attachment`, body length equal to stored |
| 26.06 | Accessible after logout and login | VERIFIED | after re-authentication the same document opens |
| 26.07 | Inaccessible to another tenant | VERIFIED | second workspace: 404 on read, list and download; viewer renders nothing |
| 26.08 | No session means no document | VERIFIED | 307 to `/login`, after correcting a test that followed the redirect and read the login page as 200 |
| 26.09 | Allowlist cannot bypass tool permission | VERIFIED | `agentAllowsTool` refuses; one grant never implies another |
| 26.10 | Allowlist cannot bypass approval | VERIFIED | refused before the decision, claimable after approval, unclaimable after rejection |
| 26.11 | Tenant coupling in the database | FIXED THIS CYCLE | a cross-tenant project reference was accepted before; the composite key now refuses it |
| 26.12 | Migration 0042 apply / rollback / reapply | VERIFIED | table, index, policy and both constraints checked at each step |
| 26.13 | RLS isolation measured | VERIFIED | non-owner role: org-a 1, org-b 1, org-c 0 |
| 26.14 | Quality gates twice | VERIFIED | 731 passed / 6 skipped / 737 in 91 files, twice, `tsc` 0 |
| 26.15 | Release readiness record | DONE | `docs/engineering/RELEASE_READINESS.md`: inventory, deployment, rollback, security, limits |
| 26.16 | AI model execution adapter (#046 P9) | NOT STARTED | no provider credential exists; model settings are stored and labelled as not executed |
| 26.17 | Natural-language action routing | NOT STARTED | next candidate |
| 26.18 | Customer onboarding acceptance | NOT STARTED | project and agent creation still go through the API and console |
| 26.19 | Browser isolation and control, command center | NOT STARTED | deliberately not simulated |

No production deployment, no production migration, no merge, no purchase. Both PRs remain Draft.

---

## Milestone 012 — the real browser (DIRECTIVE #047)

Date 16 November 2026. PR #95 head `d0d570e`. Local production build over TLS, real form login, real
Chromium 134, controlled test site on 127.0.0.1:4517, and a real public site through the worker.

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| 27.01 | Launch and close a browser | VERIFIED | `ready` after start, `stopped` after stop, frame endpoint 409 afterwards |
| 27.02 | Navigate | VERIFIED | `currentUrl` is the site loaded, title read from the live DOM |
| 27.03 | Click / type / select / scroll / read | IMPLEMENTED | runtime operations and step kinds; read verified live (917 chars) |
| 27.04 | Screenshots | VERIFIED | 11,853-byte PNG from the running browser; evidence served only to its own workspace |
| 27.05 | Timeouts, error reporting | VERIFIED | navigation and action timeouts, step budget, sanitised error text |
| 27.06 | Multi-step agent task | VERIFIED | navigate → read → screenshot through queue and worker |
| 27.07 | Arabic-first panel | VERIFIED | `/workspace/browser`, screenshot `acceptance/browser-panel.png` |
| 27.08 | Watch / Pause / Resume / Take over / Return / Stop | VERIFIED | 19/19 acceptance, every transition server-authorized |
| 27.09 | Approve / Reject controls | NOT BUILT | no mid-run approval; consequential steps refused before launch |
| 27.10 | Tenant-scoped sessions, ownership, RLS | VERIFIED | 0043 + composite key; foreign workspace 404 on read and control; non-owner 403 |
| 27.11 | Isolated cookies and profiles | VERIFIED BY CONSTRUCTION | one Playwright context per session, destroyed on close |
| 27.12 | SSRF and internal-service restrictions | VERIFIED | private/link-local/CGNAT/loopback refused on the **resolved** address; metadata refused behind a public name |
| 27.13 | Resource limits, expiry, cleanup | VERIFIED | 20-step budget, 5–180 min TTL, expiry sweep, expired session not drivable |
| 27.14 | Arabic instruction end to end | VERIFIED | 14/14: action → task → worker claim → browser in worker → evidence → completed |
| 27.15 | Human approval before consequential actions | FAIL-CLOSED | refused before a browser opens; approval wiring is the next piece |
| 27.16 | CAPTCHA / MFA | BY DESIGN | no bypass code exists; such a page fails the step |
| 27.17 | Crash recovery | NOT BUILT | a crashed context fails the step and ends the session |
| 27.18 | Live video | NOT BUILT | the "live" frame is a real screenshot polled every 2s |
| 27.19 | Interactive human clicking | NOT BUILT | the frame is an image; take-over changes authorization, not input |
| 27.20 | Gates twice | 1 clean + 1 with known flake | 747/6/753 in 92 files; `schedule.test.ts` intermittent |
| 27.21 | Infrastructure costs | ESTIMATED, NOTHING PURCHASED | self-hosted $12–24/mo; per-session containers $5–15/mo light use |

Not started, per the directive: Command Center, marketing integrations. No production deployment, no
production migration, no merge, no purchase, no paid provider.
