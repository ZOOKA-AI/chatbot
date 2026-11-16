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
| AI provider for the E2E chat leg | BLOCKED: stored Gemini key returns 400 today, no gateway key (see §5) |
| Hosted preview | PARTIAL: deployment serves and its DB answers; authenticated journeys need a bypass credential (see §6) |
| Migration audit 0028–0049 | COMPLETE, plan written, prerequisite gaps found, nothing applied |

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

## 5. AI provider: no usable credential, proven today

The E2E chat leg needs a model that answers. The chat route reads exactly two credentials,
`GEMINI_API_KEY` and `AI_GATEWAY_API_KEY`. Checked again in this cycle rather than trusted
from an earlier note:

| Credential | Availability | Live result |
| --- | --- | --- |
| `GEMINI_API_KEY` | present in the agent environment | `GET v1beta/models` → **400 INVALID_ARGUMENT, "API key not valid"** |
| `AI_GATEWAY_API_KEY` | absent | no gateway key to present |
| `GROQ_API_KEY` | present and valid | powers the agent path (`lib/agents/model-invocation.ts`), which the chat route never calls |

So there is no authorized model credential to reuse for this leg. The Groq key is real and
free, but wiring it into the chat route would be a code change to the product, not a test
setup change, and this cycle is under a development freeze for non-blockers. The E2E chat
leg therefore stays unrun, and it is not counted as passing.

What that costs, precisely: the browser E2E suite covers the chat surface. Everything the
release actually depends on (task lifecycle, worker, persistence, isolation, all 25 pages)
is covered by the run in §3, the local browser audit in §4, and the unit suite.

## 6. Hosted preview acceptance: blocked on one credential, harness ready

Two separate things were true and are now measured separately.

**Deployment protection.** The project has no Protection Bypass for Automation. Searched
every place it could live: the whole agent vault (zero keys mentioning Vercel), the agent
environment (zero `VERCEL*` names), and the earlier incident record, which confirms both
bypass secrets were deleted from the dashboard and the API reports `protectionBypass = 0`.
There is no authorized bypass credential in existence to reuse, and deployment protection
is deliberately left on.

**What was verified on the deployment anyway.** Driving the owner's own Chrome, which
already holds a team session, reaches the hosted build: `/login` and `/register` render,
`/api/auth/session` answers `null` anonymously, and `/blog` runs its real `BlogPost` query
and shows its empty state. So the deployment serves and its database answers.

**What is blocked, exactly.** Submitting either auth form from automation is refused before
the click lands:

```
Refusing to click — its link/form target is a local/private URL.
```

Reproduced on `/login` and `/register`, at the reported element coordinates, with real key
events. The page does not change and shows no validation error. This is the browser tool's
URL classifier refusing the form target, not the application rejecting a login, and it is
the reason the hosted authenticated journeys are still unverified.

**Harness is ready for the moment a bypass exists.** `scripts/acceptance/rc-brand-audit.mjs`
now reads `VERCEL_AUTOMATION_BYPASS` and presents it as `x-vercel-protection-bypass` on the
browser context and its request context, without printing it. It logs
`bypass=present|absent` and nothing else. It already logs in through
`/api/auth/callback/credentials` with a CSRF token, which is a scripted client and
therefore needs the bypass. With the secret in place, the same 25-page bilingual audit runs
against the deployment:

```
ACCEPT_BASE=https://chatbot-bz07dacsu-zooka-ai1.vercel.app pnpm exec node scripts/acceptance/rc-brand-audit.mjs
```

**Exact owner action**, one of:

1. Vercel → project `chatbot` → Settings → Deployment Protection → Protection Bypass for
   Automation → Generate, then store the value in the agent secrets form as
   `VERCEL_AUTOMATION_BYPASS` (never paste it in chat). Hosted acceptance then runs unmodified.
2. Or run the four authenticated journeys by hand in a signed-in tab: register, workspace,
   create a project, create a task and open its document.
3. Or create a Shareable Link for the preview and hand it over through the secrets form.

## 7. Database release safety: 22 pending migrations

The exact, ordered production plan is `docs/release/PRODUCTION_MIGRATION_PLAN.md`. It exists
because this audit found something that would have stopped a production run on its first
line: **production does not have the tables the pending set alters.** Comparing the pending
migrations against a schema-only dump of production (pg_dump 17.12, server 17.6, 40 tables):
`Project`, `AgentIdentity`, `AgentTask`, `AgentDecision`, `AgentApproval` and
`AgentDeployment` are absent, and `0028` opens with `ALTER TABLE "AgentIdentity" ...`, whose
`IF NOT EXISTS` guards the column, not the table. Applied as numbered, it fails with
`42P01`. The two migrations that create those tables are `0017` and `0027`, both in the base
set and both pure guarded `CREATE`s that touch no existing production table. They are the
real first step, and the plan now says so.



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

| # | Blocker | Exact owner action | Effect if unresolved |
| --- | --- | --- | --- |
| B1 | No Protection Bypass for Automation exists (verified: none in dashboard, vault or environment) | generate one in the Vercel dashboard and store it as the agent secret `VERCEL_AUTOMATION_BYPASS`, or run the four journeys by hand, or share a preview link through secrets | authenticated hosted acceptance stays unverified |
| B2 | No usable model credential: `GEMINI_API_KEY` returns 400 "API key not valid", no `AI_GATEWAY_API_KEY` | supply one free Google AI Studio key or a gateway key | the chat E2E leg stays unrun |
| B3 | 22 pending migrations, and production lacks the six prerequisite tables | approve the ordered plan in `PRODUCTION_MIGRATION_PLAN.md` | the release commit cannot be deployed |
| B4 | Vercel plan status `overdue` | settle billing | deployment reliability, not correctness |
| B5 | PR #98 is Draft | review and merge after B1–B3 | release does not ship |

## 9. Recommendation

**NO-GO today. GO once B1, B2 and B3 clear.**

What changed since the last draft of this report: the hosted deployment was reached and is
demonstrably live, so one blocker narrowed from "cannot reach it" to "cannot present a
credential to it"; and the migration audit found a real ordering defect that would have
failed a production run on its first statement, which is now written into an ordered plan.
Both are progress in the direction that matters, and neither is completion.

Nothing here is inferred. The suite ran twice, the execution path produced real ids, the
pages were loaded in both languages, the Gemini key was rejected live, and the migration
claims were diffed against a production schema dump. Production is unchanged, PR #98 is
still Draft, and no migration has been applied anywhere but the isolated preview database.
