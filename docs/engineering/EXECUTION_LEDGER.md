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
