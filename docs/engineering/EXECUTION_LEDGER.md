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

## Stage 5-6 — Authentication and API foundation

| ID | Task | Status | Notes |
|---|---|---|---|
| 5.1 | Login/register/reset audited against the code | NOT_STARTED | needs Stage 3 to test end to end |
| 6.1 | Commander HTTP decision endpoint | NOT_STARTED | deliberately not written: needs a verified Drizzle->executor link, which needs a live database |

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

## Stage 17-20 — Billing, QA, release

| ID | Task | Status |
|---|---|---|
| 17.1 | Billing sandbox verification | NOT_STARTED |
| 18.1 | End-to-end QA | NOT_STARTED |
| 19.1 | Release preparation | NOT_STARTED |
| 20.1 | Owner approval | WAITING_APPROVAL |
