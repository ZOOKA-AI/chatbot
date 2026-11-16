# RC-1 final release report (Directive #035)

Generated 2026-11-16 20:35 Asia/Dubai. Every number below was produced in this cycle, not
carried over from an earlier report.

## 1. Latest pushed commit

| Ref | Commit | State |
| --- | --- | --- |
| `release/rc-1` | `d99b562` | pushed, remote verified |
| `feat/uae-billing` | `b89b322` | pushed, cut from `d99b562` |
| Draft PR #98 | head `d99b562` | open, still Draft |
| Production | `19473c0d3` | **unchanged** |

## 2. Test results

| Gate | Result |
| --- | --- |
| Full unit regression, run 1 | **907 passed, 141 skipped, 0 failed** in 118 files (183s) |
| Full unit regression, run 2 | **907 passed, 141 skipped, 0 failed** in 118 files (193s) |
| `tsc --noEmit` | 0 errors |
| `pnpm run build` | exit 0 |
| Targeted suite on the changed files | 41/41 (Groq 7, provider diagnostics, RLS policies, migration chain, migration protocol, tenant isolation) |
| Billing core (separate branch) | 18/18 on real PostgreSQL |
| Migration ladder reconstruction | 27/27 checks |

The 141 skipped are the same named live-gated tests as before (`E2E_LIVE`,
`ZOOKA_TEST_DOMAIN_LIVE`, `WORKER_LIVE`, plus DB suites that need a live server); none was
converted from a failure into a pass.

## 3. Migration readiness

**Ready, with one ordering rule that production does not satisfy today.**

- Ladder: `0017` → `0027` → `0028..0049`. Production lacks `Project` and the five agent-core
  tables, and `0028` opens by altering `AgentIdentity`, so a numbered run fails on its first
  statement with `42P01`. Both prerequisites are pure guarded creates.
- Verified on a database rebuilt from a schema-only dump of production (40 tables), with
  seeded rows: 24/24 migrations apply, 40 → 58 tables, 62 foreign keys, 65 policies,
  `zooka_runtime` created with `NOBYPASSRLS` and 173 grants, and the runtime role sees
  `own=1 foreign=0`.
- **Eight migrations carried a real defect** and are fixed in `d99b562`: they compared a
  uuid column to `current_setting('app.organization_id', true)`, which is text, so
  `CREATE POLICY` aborted with `operator does not exist: uuid = text` on production types
  (`integration_connection.workspace_id`, `User`-owned `userId`). 26 predicates now cast the
  column to text. No other line in those files changed.
- **Duplicate emails: none.** Measured on the 2026-11-16 backup: 278 users, 0 groups sharing
  a `lower(email)`, 0 blanks. `0029` will build its unique index without a merge step. The
  constraint itself is absent today, which is the future risk `0029` closes. Remediation
  sequence prepared in `DUPLICATE_EMAIL_REMEDIATION.md`; nothing merged or deleted.
- Rollback: every `.down.sql` either applies or refuses on populated data. Five rollbacks
  are destructive by design and guarded.

Nothing applied to production. The backup taken for this analysis is 873,467 bytes, private.

## 4. Groq readiness

**Working, as the third provider.** `@ai-sdk/groq@3.0.83` (v4 implements a newer model
specification and is rejected by `ai@6` at runtime), wired behind `groq/...` model ids and
used automatically when neither a gateway key nor a Google key is configured. Existing
providers keep priority. A mistyped `groq/` id throws instead of answering with another
model, and a `groq/` id without a key is refused rather than downgraded. Verified with a
**real completion that reported token usage**, inside the test suite.

## 5. Billing implementation status

Branch `feat/uae-billing`, `b89b322`. Not active, no flag on, no provider configured, no
payment call written.

Implemented and tested: subscription status, credit balance as `SUM(ledger)`, atomic
reservation in one statement, hold/settle/release with the remainder returned, usage
counters per month and metric, insufficient-balance refusal that charges nothing, expiry
sweep for dead workers, and append-only ledger with the runtime role denied `UPDATE`/`DELETE`.
18 tests on real PostgreSQL cover double settlement, negative balance, cross-tenant
settlement, and a full loop charging 45 fils on a 60 fil hold. Price 49.00 AED and included
credit 20.00 AED are config values, provisional until the owner approves them.

Two defects the tests caught and this cycle fixed: swapped parameters in settle/release
(every settlement looked like a missing hold), and missing explicit SQL parameter types.

## 6. Remaining blockers

| # | Blocker | Owner action | Effect |
| --- | --- | --- | --- |
| B1 | Hosted authenticated acceptance | Generate a Protection Bypass for Automation and store it as `VERCEL_AUTOMATION_BYPASS`, or run the journeys by hand | the 13 hosted journeys stay unverified |
| B2 | Migration approval and window | approve `PRODUCTION_MIGRATION_PLAN.md` (order `0017` → `0027` → rest) | the release commit cannot deploy |
| B3 | Vercel plan `overdue` | settle billing | deployment reliability |
| B4 | PR #98 is Draft | review and merge after B1, B2 | release does not ship |
| B5 | Billing price and provider | approve 49/20 AED and choose a provider | paid launch cannot start |

**New finding on B1.** The hosted deployment is reachable in the owner's own Chrome: `/login`
renders fully, no SSO wall, no protection prompt. The block is one level deeper: the browser
automation layer refuses to submit this form at all, on the public domain, with the same
message it gives for a private host:

```
Refusing Enter — the focused form submits to a local/private URL.
```

Typing into both fields works; submission is refused before the click lands. So a bypass
alone will not unblock *browser-driven* login; the scripted harness
(`scripts/acceptance/rc-brand-audit.mjs`) logs in over HTTP instead of a form and is the path
that a bypass would unblock. Protection was not disabled, and nothing was bypassed.

## 7. GO / NO-GO

**NO-GO.** The engineering work in this cycle is committed, tested twice, type-checked and
built: the migration ladder is correct on production's own schema and two defects that would
have broken the production run are fixed, and the paid-launch money core exists and is
proven on real Postgres. What remains is not code: a migration window, one bypass credential
or a manual acceptance pass, a billing decision, and a merge.

Production is unchanged, main is unchanged, PR #98 is still Draft, and no payment provider,
migration or deployment was touched.

---

# Addendum, 16 November 2026 20:50 Dubai (deployment failures + payments)

## Failed deployments: both root causes are code, not configuration

| Commit | Branch | Vercel | First fatal error | Cause class |
| --- | --- | --- | --- | --- |
| `b89b322` | feat/uae-billing | failed | `lib/billing/guard.ts(57,5): error TS2322` — `balanceMinor` as `number \| undefined` | application code |
| `b4994fd` | feat/commander-tenant-scope | failed | `Route "/admin": Next.js encountered uncached or runtime data during prerendering` | application code + `cacheComponents` |
| `9c9fdb2` | feat/commander-tenant-scope | failed | same class (pages marked dynamic, then reverted) | application code + `cacheComponents` |
| `160807e` | feat/commander-tenant-scope | failed | same class; tree still lacked the fix | application code + `cacheComponents` |
| `4d811f4` | feat/commander-tenant-scope | success | — | fixed by returning `false` from `tenantScopeEnabled()` during the build phase |
| `7365e9c` | release/rc-1 | success | — | unaffected |

Each failure was reproduced in a clean worktree with `pnpm install --frozen-lockfile` and
`pnpm run build`, so the quoted line is the actual first fatal error, not an inference.

No missing environment variable and no Vercel misconfiguration was found in any of them. The
billing failure is entirely mine: I pushed `b89b322` without ever running `tsc` on its branch; the
check I ran afterwards was on `rc-1`, which does not contain those files.

Fixes: `e36858e` (billing, now **Vercel success**) and the already-landed `4d811f4` (tenant scope,
local build exit 0 and `tsc` 0). Details in `DEPLOYMENT_FAILURES_2026-11-16.md`.

## RC-1 impact: none

`rc-1` is green on Vercel at `7365e9c`, and neither defect is present on it. The credit ledger
(`lib/billing/ledger.ts`, `guard.ts`, `payments.ts`, migration `0050`) exists only on
`feat/uae-billing`. The two files named `lib/billing/*` on `rc-1` are older entitlement helpers,
untouched by this work.

## Payments, sandbox only

`feat/uae-billing` at `7da85a9`: HMAC-verified webhooks (constant-time, and a missing secret refuses
everything rather than accepting anything), body validation instead of coercion, two-layer
idempotency (unique provider reference plus event-keyed ledger grants), cross-tenant replay refused
as an attack, `past_due` on failure without credit, refunds reversed once. 9 tests on real
PostgreSQL, 27 billing tests in total, `tsc` 0, build exit 0. No provider client exists, no key is
read, and no charge is possible.

## Hosted acceptance

Still **BLOCKED**, and not by Vercel: the deployment renders in the owner's Chrome with no SSO wall,
but the browser automation layer refuses to submit the login form on the public domain
(`Refusing Enter — the focused form submits to a local/private URL`). Typing works, submission does
not. A Protection Bypass would unblock the scripted HTTP harness
(`scripts/acceptance/rc-brand-audit.mjs`), not the browser form path, so the six journeys need
either that bypass stored as `VERCEL_AUTOMATION_BYPASS` or a manual pass. Protection was not
disabled and nothing was bypassed.
