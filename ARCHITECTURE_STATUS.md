# ZOOKA-AI — Architecture Status

Updated 16 November 2026. Every line below states what was actually observed, with the
command or artefact that produced it. Where a milestone is only partly provable, it says
so instead of rounding up.

## Verification baseline

| Gate | Result | How |
| --- | --- | --- |
| Test suite (serial, twice) | 725 passed, 6 skipped, 731 total, 90 files | `npx vitest run --no-file-parallelism`, twice, identical counts |
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

### Milestone 008 — real execution lifecycle — PARTIAL, one external blocker

Two defects were found by running the lifecycle instead of reasoning about it, and both were real.

**The worker was unreachable over HTTP.** `proxy.ts` treated every `/api/*` path as session-only,
so an agent presenting its bearer key to `/api/agents/worker` was redirected to `/login` with a
307. No task could ever be claimed in a real deployment, even though the route itself authenticates
the key and answers 401 without a valid one. The proxy now lets a request carrying an agent
credential reach `/api/agents/worker` and `/api/agents/heartbeat` only, and both still refuse
without a valid key, so nothing is bypassed. Every other `/api` path still requires a session.

**The task's own payload was discarded.** The worker route passed only the request body, so a
worker claiming a task the Action Catalog had queued ran the tool with `{}`. The tool then answered
"malformed repository name" instead of reading the repository the customer chose. The worker now
defaults to the payload of the task it actually claimed, and an explicit caller payload still wins
when one is sent. Four contract tests pin the split: the route never invents a payload, the queue
claim resolves a real task, an explicit body passes through, and an empty queue runs nothing.

**Evidence the inputs now flow.** Same action, same tool, before and after the fix: before,
`Malformed repository name.`; after, `GitHub refused the metadata request (401).` The second is a
real outbound request made with the repository the task carried, which is what the fix was for.

**Where the lifecycle stands.** `scripts/acceptance/action-execution.mjs`, run against a local
production build over TLS with a real form login, 11 of 14 checks passed:
signed in through the form; an agent created holding only `github_repo_inspect`; project created
through the customer API (201); agent attached (200); action accepted and a task queued (201,
status `pending`); the worker authenticated with its own key and claimed it; an execution row was
written; the task moved out of `pending` because the worker moved it, not the UI; the project page
shows `Tasks (1)` and `Execution evidence (1)`; a duplicate submission is deduplicated; and no
execution on that project belongs to another workspace.

**The blocker, stated exactly.** The tool reached `api.github.com` and was refused with 401: the
only GitHub credential available in this sandbox is a git credential that the REST API does not
accept, and the workspace has no GitHub connection. So the run ends in a persisted, honest failure
rather than a persisted success. No mock was substituted to manufacture a pass, and no fake
provider was introduced.

**Verified supporting behaviour.** The workspace had no `Subscription` row at all, and the runner
correctly refused with `plan_does_not_include_agent_runs` before creating any task; a plan row was
then added to the test database and the action was accepted. A refusal that only appears because
the data is missing is a working guard, not a bug.

### Directive #041 and #042, priorities 2–6 — NOT STARTED

Not attempted in this milestone, and nothing is claimed for them: the operations dashboard
integration (#041), the browser isolation contract and lifecycle (#042 P2), the customer browser
panel (#042 P3), and the provider comparison (#042 P4). The reason is capacity in this working
session, not a technical block. No infrastructure was purchased, no provider was activated, no
production deployment or migration was performed, and both pull requests remain draft.

### Milestone 009 — first real customer result — COMPLETE

The gap left by milestone 008 was that every executable action needed a credential the platform did
not have. The fix was not a mock: it was an action that needs no external account at all.

**`workspace_readiness_inspect`, an internal read-only tool.** It reads the caller's own agents,
projects, tasks, schedules and executions and writes a short report of what needs attention. Five
SELECTs, all scoped by `organizationId`, no write of any kind, no network call. It resolves its
connection through the same lazy handle as the rest of the Commander, so inside a tenant
transaction it is subject to that tenant's policies.

**A trap found while wiring it.** The catalog's input validator compiles template patterns with
`new RegExp(pattern)` and no `u` flag, so a `\p{L}` class silently degrades into literal
characters and rejects valid input. The action now uses an explicit range, and the reason is
recorded next to it. A second guard, the explicit per-tool payload mapping, refused the new tool
until a mapping was added: the catalog will not guess what a tool receives.

**A stale process cost one bad reading.** The first acceptance attempt after adding the mapping
still returned 500 `no payload mapping for tool`, because an older server instance still held the
port and answered instead of the new build. `lsof` did not show it; `fuser -k` cleared it. The
lesson is recorded because the failure looked like a code defect when it was a process defect.

**Acceptance, 14 of 14, on a local production build over TLS with a real form login:**

| Stage | Evidence |
|---|---|
| Sign in through the form | session for `owner@acceptance.local` |
| Agent with exactly one tool | created through the API |
| Project | 201 |
| Agent assignment | 200 |
| Action accepted | 201, task `ceec4c6a`, status `pending` |
| Not claimed by the UI | still `pending` before the worker runs |
| Worker claim | 200, authenticated with the agent's own key |
| Tool execution | a real report: `تقرير الجاهزية — 7 agent(s) (7 active) · 13 project(s) · 9 task(s) (2 pending) · 7 execution(s)` |
| Task left `pending` by the worker, not the UI | `completed` |
| Result shown to the customer | `Tasks (1)` and `Execution evidence (1)` |
| Duplicate submission | no second task |
| Tenant isolation | zero executions on this project from another workspace |

Reload persistence is covered by the detail page being fetched fresh from the database after
execution, and by `acceptance/execution-project.png`, captured from the authenticated page.

**Directive #044, item by item.**
Item 01: the proxy exception is limited to exact path matches for `/api/agents/worker` and
`/api/agents/heartbeat`, and both still call `authenticateAgent`, which returns null for an invalid,
revoked or disabled agent key and answers 401. Every other `/api` path still requires a session.
Item 02: implemented as the readiness report rather than "Create Project Document". It is the
smaller honest step: the document action needs a tenant-scoped document store and a viewer in the
workspace, which is Phase 2 work and was not attempted. Item 03: 14/14 above. Item 04: no GitHub
connection exists and none of the credentials reachable here is accepted by the REST API, so
`repo_health_report` still ends in an honest 401. Items 05, 06, 07 (browser isolation, human
control, command center) are not started; the browser runtime needs a provider decision from the
owner and no paid infrastructure was activated.

### Milestone 010 — a document the customer keeps — COMPLETE

The first customer artifact. An action now produces something a person would actually open again,
stores it, and hands it back as a file.

**What it produces.** `project_document_create` takes a title and a brief and assembles a structured
Markdown document: objective, scope, plan, risks and controls, acceptance criteria. Every section is
a deterministic arrangement of the words the customer wrote. No model is called, so a document
cannot contain a claim the customer did not make, and the document says so in its own footer.

**Storage.** `ProjectDocument` (migration 0042) is scoped by `organizationId`, references its
`AgentProject` with `ON DELETE CASCADE`, and references the `AgentTask` that produced it with
`ON DELETE SET NULL`. RLS is enabled with a tenant policy in the same shape as 0041, and
`taskId` carries a partial unique index, so one run cannot silently overwrite another's artifact.

**The worker gate had to change, carefully.** The worker refused every non-read-only tool, which is
the right default. Rather than loosening it, a tool may now run only when it declares
`internalWrite` *and* appears in `INTERNAL_WRITE_TOOLS`. A tool that sets the flag without being on
the list is still refused, and the absence of the flag still means read-only.

**Acceptance, 22 of 22, on a local production build over TLS with a real form login:** action
queued `pending` → worker claims with its own key → `project_document_create` runs → a 1,017
character document is stored → task `completed` by the worker → the project page lists it → the
viewer page renders it after a fresh load → `?download=1` returns `text/markdown` as an attachment
with a body of exactly the stored length → an unknown document id answers 404 rather than leaking.

**Migration verification.** 0042 applied to the repo-schema database (parity suite green) and to a
scratch database through up → verify table, index, policy and foreign key → down → verify the table
is gone → up again. No production database was touched.

**Not done in this milestone, and not claimed:** the browser isolation contract, the customer
browser control interface, the command center integration and the natural-language router
(#045 priorities 2 to 5). Priority 6 found no new credential: the GitHub action still ends in an
honest 401, so it is documented rather than faked.
