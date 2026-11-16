# ZOOKA-AI — Architecture Status

Updated 16 November 2026. Every line below states what was actually observed, with the
command or artefact that produced it. Where a milestone is only partly provable, it says
so instead of rounding up.

## Verification baseline

| Gate | Result | How |
| --- | --- | --- |
| Test suite (serial, twice) | 646 passed, 6 skipped, 652 total, 80 files | `npx vitest run --no-file-parallelism`, twice, identical counts |
| TypeScript | 0 errors | `npx tsc --noEmit` |
| Production build | compiled | `pnpm run build` |
| Migration parity | 2/2 passed | `tests/unit/migration-schema-parity.test.ts` against a database rebuilt from every migration |
| Tenant isolation | passed | `tests/unit/commander-tenant-*.test.ts`, `tenant-*.test.ts` against real PostgreSQL 15.19 on 127.0.0.1:55432 |
| Browser acceptance | 9/9 passed | `scripts/acceptance/workspace-ui.mjs` against a local production build over TLS, screenshots in `acceptance/` |

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
