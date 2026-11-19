# ZOOKA-AI — Master plan

The single map from where the platform is to a multi-tenant, bilingual,
production-ready agent SaaS. Stages run in dependency order; a blocked stage does
not stop independent work in later stages.

## Principles

1. Audit before building; never rebuild something already verified.
2. Evidence or silence: `VERIFIED` requires a command whose output is quoted.
3. One workspace, one tenant boundary, enforced server-side, never from the browser.
4. Sensitive action, human approval, durable decision record.
5. No invented features. A control that does nothing is removed or labelled.
6. Production and preview credentials never share a value.

## Stages

| # | Stage | Dependency | Status |
|---|---|---|---|
| 0 | Repository and architecture audit | none | mostly done, see ledger |
| 1 | PR #91 security release | bypass key + approval | READY, blocked at access |
| 2 | Production health verification (read-only) | none | partially done |
| 3 | Isolated development database | owner decision | **BLOCKED**, unlocks the most |
| 4 | Tenant isolation + 0027 on a real server | 3 | engine-verified only |
| 5 | Authentication end-to-end | 3 | not started |
| 6 | Backend API foundation | 3 | not started |
| 7 | Commander engine | 4 | implemented, not deployed |
| 8 | Approval workflows | 7 | implemented, not deployed |
| 9 | Commander frontend | 3, 7 | not started |
| 10 | Agent orchestration | 7 | partial (n8n bridge works) |
| 11 | Integration framework | 6 | 9 connectors, one audited executor |
| 12 | Public website | none | partial, dead routes remain |
| 13 | Unified frontend design | 9 | tokens ready, not applied |
| 14 | AI Studio | 6 + a real media provider | partial |
| 15 | Memory and files | 3 | partial |
| 16 | Live Browser | paid provider decision | architecture only |
| 17 | Billing sandbox | 6 | not started |
| 18 | End-to-end QA | 5-17 | not started |
| 19 | Release preparation | 18 | not started |
| 20 | Owner approval | 19 | waiting |

## Blockers

| ID | Error | Impact | Owner action | Independent work meanwhile |
|---|---|---|---|---|
| B1 | Supabase admin token `401 JWT could not be decoded`; free project quota exhausted | no dev database, so no live Commander, isolation or migration proof | a Neon free seat, a second Supabase account, or approval to upgrade | everything engine-level, docs, tokens, tests |
| B2 | Vercel refuses `protectionBypass` via API (400/404) | preview cannot be verified live | create the bypass in the dashboard, store it as a secret (see `PREVIEW_ACCESS.md`) | loopback HTTP tests over a real Postgres engine |
| B3 | GitHub token lacks `workflow` scope | no CI job that could run migrations against a dev database | grant the scope | Vercel's own preview checks already gate merges |
| B4 | no Vercel log drain | past unauthorised requests unreadable | decide on the paid drain, or accept refusal-logging forward only | structured refusal logging already shipped in PR #91 |
| B5 | Postgres port 5432/6543 blocked from the sandbox | no direct DB inspection | none, if the app routes are used | use `/api/admin/*` routes |

## What is deliberately not being built now

Interface redesign beyond the token layer, the executor browser, and any paid
capability. The owner deferred these to a later phase, and building them against
a missing database would produce exactly the kind of unverifiable surface the
operating rules forbid.
