# RC-1 Release Readiness

Branch: `release/rc-1` · Draft PR: #98 · Report date: 2026-11-16 (Asia/Dubai)
Supersedes the earlier readiness drafts for this cycle. Every number below was read
from a run performed in this session, not carried over from a previous report.

## Verdict

**NO-GO for production promotion.** The release candidate is internally sound: the
suite is green twice, TypeScript is clean, the production build compiles, the full
execution path is proven end to end, and 25 pages pass the bilingual audit. What is
missing is not code. Three gates are outside the branch: hosted acceptance cannot
reach the deployment, the browser E2E leg has no model credential, and the 22 pending
migrations need an owner decision before they touch anything.

| Gate | Result |
| --- | --- |
| TypeScript (`tsc --noEmit`) | PASS, 0 errors |
| Production build (`pnpm run build`) | PASS, exit 0 |
| Unit suite, run 1 | 900 passed / 0 failed / 141 skipped (1041) |
| Unit suite, run 2 | 900 passed / 0 failed / 141 skipped (1041) |
| Execution lifecycle (API, real routes) | PASS 15/15 |
| Brand and locale audit | PASS 50/50 (25 pages × ar/en) |
| Browser E2E leg (`tests/e2e`) | BLOCKED, environment (see §5) |
| Hosted preview acceptance | BLOCKED, Vercel SSO (see §6) |
| Migration audit 0028–0049 | COMPLETE, no production application |

## 1. Final commit

| Commit | Meaning |
| --- | --- |
| `0f2bba9` | Last code commit: `documents` page drops the route segment config `next build` rejects |
| `e96f27a` | Documents index, accessible names, suite time budget |
| `c428a07` | Migration 0049 relocated to the pending set with a rollback |
| `a5540aa` | Session cookie on form login, agent tool assignment, plan guard, runtime grants |

`release/rc-1` is the only branch touched. `main` and the production deployment are
unchanged by this work.

## 2. Regression: 900 passed twice

`pnpm test` is `vitest run tests/unit` followed by the Playwright leg. Two consecutive
unit runs produced identical counts, which is the point of running twice: the earlier
flakiness in this suite was cross-file database state, so a single green run proves
little.

```
Tests  900 passed | 0 failed | 141 skipped (1041)   run 1
Tests  900 passed | 0 failed | 141 skipped (1041)   run 2
Test Files  103 passed | 14 skipped (117)
```

The 141 skips are deliberate: live-provider suites gated behind `E2E_LIVE`,
`ZOOKA_TEST_DOMAIN_LIVE` and `WORKER_LIVE`, which cannot run without paid credentials.
They are skips, not passes, and this report does not count them as coverage.

One harness change was needed and is committed with the reason: the suite-wide 5s
default became 20s. The database suites build and tear down whole schemas inside
PGlite, and on a loaded machine they crossed 5s while passing in isolation. That is a
time budget, not an assertion. No assertion was weakened or removed.

## 3. Execution acceptance: 15/15

The full path, exercised through the real HTTP routes on a production build against the
isolated Neon preview database, no mocks:

```
Chat → Commander → Task → Scheduler → Worker → Authorized Tool → Persisted Evidence → User-visible Result
```

| Step | Evidence |
| --- | --- |
| Session established | 200, tenant A |
| Action catalog | 11 actions, 11 executable |
| Tool catalog | 5 tools advertised |
| Agent registration | 201, key issued |
| Tool assignment | PATCH 200, `allowedTools=["project_document_create"]` |
| Project creation | 201, `d3a90d51-995f-490b-a6bd-fd5481be17f5` |
| Agent assigned | 200 |
| Task creation | 201, `0392cc0b-5686-409d-85f8-c268d6d37bec` |
| Duplicate request | 201, `deduplicated=true`, same task id |
| Worker execution | 200, execution `ec55cb1d-7280-479d-a550-b3e53f637721`, status `completed` |
| Evidence persisted | GET 200, status `completed`, evidence object present |
| Task detail | GET 200 |
| Task history | GET 200, count 5 |
| Document created | GET 200, count 1, title `RC document …` |
| Tenant isolation | second tenant: project 404, task 404, project documents 404 |

Failure handling was checked on the same surface, not assumed: an unassigned tool is
rejected before the worker claims the task, a missing or stale payload falls back to
the payload the planner stored (the fix that made this run possible), and cross-tenant
reads return 404 rather than an empty list, so existence does not leak.

Defect found and fixed in this cycle: the worker claimed tasks with a caller-supplied
payload that omitted `projectId`, so `project_document_create` failed on a project that
the customer had chosen. The worker now defaults to the stored payload; the acceptance
run above deliberately sends no payload to prove the fallback.

## 4. Brand and locale acceptance: 50/50

25 pages, each in Arabic RTL and English LTR, driven through a real browser at
`1440×1182` desktop and a mobile viewport, with screenshots captured per page and
locale (130 images under `acceptance-rc/brand/`).

| Check | Result |
| --- | --- |
| Route reachable in both locales | 50/50 |
| Arabic RTL direction and font shaping | pass on every page |
| English LTR | pass on every page |
| Mobile layout, no horizontal overflow | pass |
| Navigation and footer links resolve | pass |
| Accessible names on interactive controls | pass after fix |
| Real backend connections | pass; pages that need a session redirect to `/login` instead of rendering empty |

Four defects were found by this audit and fixed:

1. `/workspace/documents` did not exist. A document could only be reached through the
   project that produced it, so a customer who left the project page lost their own
   file. The new index page scopes its query by `organizationId`.
2. Three icon-only controls had no accessible name (sidebar toggle, delete-all-chats,
   new chat), and the studio upload input had none. Tooltips are not names.
3. `schedule.test.ts` timed out on a dynamic import rather than an assertion.
4. The audit listed `/compare`, a route the product never had; the real route is
   `/cookies`.

## 5. Browser E2E leg: BLOCKED, environment

`tests/e2e` (99 tests) starts its own dev server and drives the chat UI. It stops at
test 3, "sends message and receives AI response":

```
Error: locator.fill: Test timeout of 240000ms exceeded
```

Root cause, established rather than guessed: the test sends a message and waits for an
assistant reply, which requires a model provider credential and an authenticated chat
session in the harness. Neither exists in this sandbox: every provider key on Preview
is absent by design, and `PAID_GENERATION_ENABLED=false` refuses paid inference. The
input never becomes usable, so `fill` waits until it times out. This is the harness
lacking a provider, not a regression in the branch: the same tests passed selection but
not execution, and no assertion in them touches RC-1 code.

To unblock: a Groq (or equivalent) key in the E2E environment. Groq was already proven
reachable in this project (`GET /v1/models` 200, one real completion), so a single
non-paid key closes this leg.

## 6. Hosted preview acceptance: BLOCKED, Vercel SSO

Critical user journeys were replayed against the real Preview URL
`https://chatbot-bz07dacsu-zooka-ai1.vercel.app` and did not get through:

```
GET /login  302  location: https://vercel.com/sso-api?url=…
GET /       302  location: https://vercel.com/sso-api?url=…
```

Vercel Deployment Protection intercepts every request. Local browser results are not
substituted for hosted acceptance, per directive. A bypass token was previously found
to be configured and was reported as compromised (it appeared in a tool log); the
owner rule is that `VERCEL_AUTOMATION_BYPASS` belongs in agent secrets and is never
pasted into chat. That secret is currently absent, so this gate stays blocked until the
owner adds it through the secrets form. Nothing else about the deployment is in doubt:
the Preview build for this branch is READY and its database is isolated.

## 7. Database release safety: 22 pending migrations

`lib/db/migrations/pending/` holds 22 migrations, numbered `0028` through `0049`, each
with a paired `.down.sql` (44 files). The eight that ship with the earlier baseline are
already applied on the preview database; this audit covers the whole pending set.

| Property | Finding |
| --- | --- |
| Ordering | Strict numeric order, no gaps, no duplicates in the pending set. The legacy `0000–0027` journal still has duplicate numbers (`0014`, `0015`, `0016`, `0017`) from before this cycle, which is why the runner is the self-hosted migrator and never `pnpm db:migrate`. |
| Build from scratch | 46/46 applied to an empty Neon database, 0 failures, exit 0; result 47 tables including the tracking table. |
| Idempotency | Re-running the ladder is safe; each file guards its own objects. |
| Existing data | Data-bearing tables are altered additively. Rollback of the destructive migrations is refused by guard when rows exist: `0029`, `0034`, `0035`, `0038`, `0039` raise instead of dropping a populated table. |
| Runtime grants | `0031` creates `zooka_runtime` (LOGIN, NOSUPERUSER, NOBYPASSRLS) and grants it only what the app reads; `0049` adds the missing `OrganizationMember` grants that broke login on Preview. |
| RLS | Policies present on the agent, project and document tables. Measured with a non-owner role: tenant A sees 1 row, tenant B sees 1 row, tenant C sees 0. |
| Application compatibility | The ORM in `lib/db/schema.ts` matches the post-migration shape; the parity test builds from the pending set and compares. |
| Production | **Not applied.** No migration has been run against `zrfrsaquvmwctsajhlm` in this cycle. |

Rollback procedure, in order: (1) take a dump before applying; (2) apply up-migrations
in numeric order; (3) on failure, stop and run only the `.down.sql` for migrations this
run completed, newest first; (4) destructive rollbacks will refuse while data exists,
which is the intended safety, so clearing a table is a separate owner decision; (5)
verify with the parity test and a real login before declaring recovery.

## 8. Remaining blockers

| # | Blocker | Owner action | Effect if unresolved |
| --- | --- | --- | --- |
| B1 | `VERCEL_AUTOMATION_BYPASS` absent from agent secrets | add via the secrets form | hosted acceptance stays BLOCKED |
| B2 | No model provider key in the E2E environment | provide one non-paid key (Groq) | browser E2E leg stays BLOCKED |
| B3 | 22 pending migrations unapplied to production | approve the sequence in §7 | cannot promote; app code assumes the new shape |
| B4 | Vercel account status `overdue` | settle billing | deployment risk is schedule, not correctness |
| B5 | PR #98 is Draft | review and merge when B1–B3 clear | release does not ship |

## 9. Recommendation

**NO-GO today, GO once B1, B2 and B3 clear.** The engineering work the release depends
on is done and reproducible twice over: the execution path is real, the suite is green,
the build compiles, and the pages hold up in both languages. Nothing in this report is
inferred from a previous run. Promoting before hosted acceptance passes would mean
shipping on local evidence alone, which is exactly the substitution the directive
forbids.
