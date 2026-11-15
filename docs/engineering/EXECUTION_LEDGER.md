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

## Stage 17-20 — Billing, QA, release

| ID | Task | Status |
|---|---|---|
| 17.1 | Billing sandbox verification | NOT_STARTED |
| 18.1 | End-to-end QA | NOT_STARTED |
| 19.1 | Release preparation | NOT_STARTED |
| 20.1 | Owner approval | WAITING_APPROVAL |
