# ZOOKA-AI — Architecture Status

Updated 16 November 2026. Every line below states what was actually observed, with the
command or artefact that produced it. Where a milestone is only partly provable, it says
so instead of rounding up.

## Verification baseline

| Gate | Result | How |
| --- | --- | --- |
| Test suite (serial, twice) | 707 passed, 6 skipped, 713 total, 87 files | `npx vitest run --no-file-parallelism`, twice, identical counts |
| TypeScript | 0 errors | `npx tsc --noEmit` |
| Production build | compiled | `pnpm run build` |
| Migration parity | 2/2 passed | `tests/unit/migration-schema-parity.test.ts` against a database rebuilt from every migration |
| Tenant isolation | passed | `tests/unit/commander-tenant-*.test.ts`, `tenant-*.test.ts` against real PostgreSQL 15.19 on 127.0.0.1:55432 |
| Browser acceptance | 17/17 passed | `scripts/acceptance/workspace-ui.mjs` against a local production build over TLS with a real form login, screenshots in `acceptance/`, trace in `acceptance/trace.zip` |
| Migration 0041 verification | 18/18 checks passed | `scripts/verify/workspace-projects-migration.sh` on a database rebuilt from all 42 migrations |

Parallel full-suite runs showed one intermittent failure in
`tests/unit/schedule.test.ts > two passes in the same second do not create two tasks`
(1 failure in 3 parallel runs). Isolated: 18/18 passed, five consecutive runs. The
assertion was not weakened; serial execution is how the database suites run here.

## Milestones

Legend: VERIFIED = reproduced end to end with evidence. PARTIAL = the logic is proven but a
stated acceptance clause is unmet. BLOCKED = cannot be attempted with available access.
NOT_STARTED = no work.

### 001–005 Foundation — VERIFIED
PostgreSQL 15.19 schema, Drizzle ORM, NextAuth sessions, workspace/organisation scoping and
the chat surface are exercised by the suite on a real database. `lib/db/tenant.ts` binds the
caller's workspace inside an explicit transaction and refuses the merged session+body object.

### 006 Agent management — PARTIAL
VERIFIED: migration `0040` adds `allowedTools` and `instructions`; the worker refuses an
unassigned tool *before* claiming a task (8 route-level tests, including "nothing is claimed");
malformed stored permissions fail closed; a disabled agent is rejected at authentication
(`agentIdentity.status = 'active'` in the lookup); cross-tenant writes return null; model
provider and model id are validated and persisted (18 tests, plus real-DB assertions).
New agents now start with `allowedTools: []`; `NULL` is reported as `legacy_unrestricted`
rather than passing as configuration.
UNMET: browser acceptance (below), and model selection is **stored, not operational** — no
LLM-backed worker tool exists, so execution never routes to the chosen model. The UI says so.

### 007 Scheduling — PARTIAL
VERIFIED: `lib/agents/schedule.ts` owns the whole lifecycle (create, list, get, update,
delete, history). Writes are refused before storage for `invalid_cron`, `cron_never_fires`
(checked with the same `nextRunAfter` the scheduler uses) and `invalid_timezone`. Changing the
cron or timezone recomputes `nextRunAt`; changing only the title does not. Routes are scoped to
the caller's workspace and answer 404, not 403, for another tenant's schedule. Duplicate
prevention holds under isolation.
UNMET: `/workspace/schedules` is build-verified only — never clicked through in a browser.

### 008 Business launch — PARTIAL
`/workspace/launch` renders persisted plans and real step states. Build-verified; not
exercised in a browser.

### 009–024 Commander, approvals, audit — VERIFIED (logic)
Atomic approval decisions, conditional task transitions, cursor pagination on
`(organizationId, createdAt DESC, id DESC)` and the tenant role `zooka_runtime`
(NOSUPERUSER, NOBYPASSRLS) are covered by tests that run the real queries.

### 025 Browser automation — NOT_STARTED
No isolated browser session subsystem exists.

### 026 Portability — PARTIAL
Migrations apply cleanly to an empty database; a restore into an isolated database was
verified previously with row-level hash equality. Docker is not installed in this environment,
so container-isolated execution is unproven.

### 027–028 Hardening / first user — NOT_STARTED / BLOCKED
Production work is awaiting the owner's explicit approval of the release commit, migration
plan, deployment plan and rollback procedure.

### 029–030 Integrations / connectors — VERIFIED (logic)
26 documented, 24 implemented, refusal happens before any network call, 2000 reads/month per
connector per workspace, writes refused by design.

## Pending migrations (NOT applied to Production)

| File | Purpose | Notes |
| --- | --- | --- |
| `0036_chat_soft_delete.sql` | `Chat.deletedAt` | idempotent, `.down.sql` present |
| `0037_email_verified_at.sql` | `User.emailVerifiedAt` | **Production deployment prerequisite** |
| `0038` | scheduling + model columns | pending |
| `0039` | pending | pending |
| `0040` | `AgentIdentity.allowedTools`, `instructions` | nullable, so existing rows stay valid |

Production has none of these applied and no deployment has been made.

## Browser acceptance — the login is real and the form is what runs

Two separate faults made a correct login look broken, and both were in the harness, not the
application. The first cost a turn of work; the second was diagnosed only after reading the
server log instead of inferring from the browser.

**Fault one: cookie policy.** The app runs in production mode, so Auth.js issues
`__Secure-authjs.session-token` with the `Secure` flag, and a browser discards that from a plain
`http://` origin. `scripts/acceptance/tls-proxy.mjs` terminates TLS locally so the runtime matches
production.

**Fault two: the proxy's Host header.** The proxy rewrote `Host` to the upstream port, so the
browser's `Origin: https://localhost:3443` no longer matched and Next.js answered the sign-in
server action with `Error: Invalid Server Actions request`. The action therefore never ran to
completion and no session cookie was issued. The proxy now forwards the original host. Nothing in
the authentication code was changed, no session was minted, and the sign-in is the form a
customer uses.

**Correction to the previous entry.** I recorded this as an open product anomaly, suggesting
email/password sign-in might be broken in production. That was wrong. The evidence now shows the
server action is rejected before it executes, and only under the rewritten host. Email/password
sign-in through the form works when the request reaches the app intact.

Result against a production build on an isolated database, signing in through the form:

| Check | Result |
| --- | --- |
| The login form establishes a session cookie | `__Host-authjs.csrf-token`, `__Secure-authjs.callback-url`, `__Secure-authjs.session-token` |
| The login form leaves the login page | `/` |
| Session resolves to the signing customer | `owner@acceptance.local` |
| `/workspace/agents` renders, no bounce | 200 |
| Agent created in the UI is listed after reload | pass (`Agents (4)`) |
| `/workspace/schedules` renders, no bounce | 200 |
| Schedule created in the UI is listed after reload | pass (`Schedules (3)`) |
| `/workspace/launch` renders, no bounce | 200 |
| Launch plan created in the UI is listed after reload | pass (`Launch plans (4)`) |

Screenshots: `acceptance/agents.png`, `acceptance/schedules.png`, `acceptance/launch.png`.
Trace: `acceptance/trace.zip`.

## Security properties, each checked against the thing that enforces it

| Property | Enforced by | Evidence |
| --- | --- | --- |
| New agents get `allowedTools: []` | `registerAgent` insert default | regression test reads the stored row; all four browser-created agents in the acceptance database have `[]` |
| Legacy unrestricted identities are named, not silently trusted | `describeToolAssignment` | `legacy_unrestricted` mode test, plus a test that sets a stored `NULL` and reads it back |
| Permissions are checked at execution time | worker route before claiming | 8 route tests, including "nothing is claimed"; a stored list edited after queueing governs that run |
| A disabled agent cannot execute | `authenticateAgent` filters `status = 'active'` | test registers a key, authenticates, disables the identity, and asserts `null` |
| Cross-tenant access is refused | `organizationId` scoping in every query | `commander-tenant-*` suites on real PostgreSQL as `zooka_runtime` |
| Model configuration persists | `updateAgentConfig` | 18 tests, one of which fails if the writer drops a field again |

## Blocked

Nothing in Phase 0 remains blocked. Production work still awaits the owner's approval of the
release commit, migration plan, deployment plan and rollback procedure.

## Known disclosure

Commit `c5a7e128` committed a scratch probe (`probe.comparison.mts`) containing the throwaway
local acceptance password. It is a test credential for an isolated local database, not a
production secret, but it is in history: that file has been deleted here, and the password should
be treated as burnt and never reused anywhere else.

### Phase 1 — Workspace OS and action catalog — PARTIAL

A project is now the thing work belongs to. `AgentProject` is a tenant-scoped table; agents,
tasks and schedules carry a nullable `projectId`, so a project groups the agents assigned to it,
the tasks they produced, and the evidence from every execution.

**Schema and migration.** `lib/db/migrations/pending/0041_workspace_projects.sql` is additive
only: one new table, three nullable columns, a unique `(organizationId, name)` index, RLS enabled
with a tenant policy that also applies to writes (`WITH CHECK`), and a paired `.down.sql`.
Verified 18/18 on a database built from all 42 migrations: objects present, three foreign keys,
policy enforced, workspace A and B each seeing only their own row, no tenant context seeing
nothing, a cross-tenant insert refused by policy, rollback dropping only the new objects, and
re-apply restoring them.

**Conditional link to the hosted site.** `siteProjectId` points at the existing `Project` table
(a hosted website), but that foreign key is created only when that table exists in the database.
This is deliberate, not defensive noise: a deployment built from the agent migrations alone has
no `Project` table, and an unconditional key made the migration fail there. Both shapes are
covered by `tests/unit/workspace-project-schema.test.ts` — with the table present the key exists
with `ON DELETE SET NULL`; with it absent the column still exists so a later deployment can
attach the link.

**Store.** `lib/projects/store.ts` scopes every read and write by `organizationId`; another
workspace's project reads as missing rather than forbidden. Deleting a project with no work
removes it; deleting one that holds tasks archives it instead and keeps the work, because tasks
are a record of what really ran. Verified on real PostgreSQL by `tests/unit/workspace-projects.test.ts`
(17 tests): isolation, name uniqueness per workspace, rename collisions, unknown status and empty
patch refused, cross-tenant edit not found, delete versus archive, agent assignment refusing an
agent from another workspace, an agent holding the tool being the one resolved for a run, a
disabled agent never resolved, and tasks/executions/schedules rolling up through the project.

**Action catalog.** `lib/actions/catalog.ts` is a versioned contract: bilingual title and
description, typed inputs with patterns, responsible role, required tools and integrations,
approval flag, workflow and outputs. `executable` is derived from the worker's own tool registry
rather than asserted, so an action naming a tool the worker does not implement cannot appear as
available. `planActionExecution` refuses a template that is not executable, a tool that is not
assigned, an inactive agent, a plan without agent runs, and an exhausted allowance — every
refusal before a task exists. 20 catalog tests, 21 runner and route tests.

**Duplicate submissions.** `runAction` treats an identical request inside a five-minute window,
still queued or running, as the same task and returns it with `deduplicated: true` instead of
queueing it twice. A finished task is not reused, and an older identical request is new work.

**Interface.** `/workspace/projects` and `/workspace/actions` render server-side permissions and
client-side data from the API only; nothing on the page states a state the database does not
hold. The catalog is Arabic-first, searchable, filtered by category, and an action is refused in
the UI when no agent on the chosen project holds its tool. Reached from the sidebar.

**Browser acceptance.** 17/17 against a production build over TLS with a real credentials login
(no session minting): session established, agent created and persisted, schedule created and
persisted, launch plan created and persisted, project created and persisted across a reload with
a true count, project detail showing its task and execution rollups at zero rather than a
placeholder, the Arabic-first catalog rendering, an action opening for details, and the run
control disabled because the newly created agent holds no tools. Screenshots:
`acceptance/projects.png`, `project-detail.png`, `actions.png`, `action-detail.png`.

**Regression found and fixed during this milestone.** Adding `projectId` to the Drizzle schema
broke 15 tests in `commander-concurrency` and 15 in `commander-tenant-isolation`. The cause was
not the migration: eleven PGlite harnesses build their own schema from an explicit list of
migration files that ended at 0040, so they had a database without the column the ORM declares.
The fix was to add 0041 to each chain and to make the runtime-role grant conditional, because
those harnesses never create `zooka_runtime`; the migration now reports the absent role instead
of failing silently. No assertion was weakened.

**Not verified in this milestone.**
- Running an action all the way to a stored result in the browser. The path from a request to a
  queued task is proven (unit, route and browser), but claiming and executing need an agent
  holding a tool plus a live provider credential; the browser run's agent was created with the
  new zero-tool default, so the UI withheld execution rather than pretending.
- Project membership beyond owner/admin. There is no per-project member list; access follows the
  workspace role, and the UI hides write controls from members. A finer model is not built.
- Mobile layout beyond a responsive check at one viewport; no device matrix was run.
