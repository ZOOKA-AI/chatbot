# ZOOKA-AI — Architecture Status

Updated 16 November 2026. Every line below states what was actually observed, with the
command or artefact that produced it. Where a milestone is only partly provable, it says
so instead of rounding up.

## Verification baseline

| Gate | Result | How |
| --- | --- | --- |
| Test suite (serial, twice) | 643 passed, 6 skipped, 649 total, 80 files | `npx vitest run --no-file-parallelism`, twice, identical counts |
| TypeScript | 0 errors | `npx tsc --noEmit` |
| Production build | compiled | `pnpm run build` |
| Migration parity | 2/2 passed | `tests/unit/migration-schema-parity.test.ts` against a database rebuilt from every migration |
| Tenant isolation | passed | `tests/unit/commander-tenant-*.test.ts`, `tenant-*.test.ts` against real PostgreSQL 15.19 on 127.0.0.1:55432 |
| Browser acceptance | 8/8 passed | `scripts/acceptance/workspace-ui.mjs` against a local production build over TLS, screenshots in `acceptance/` |

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

## Browser acceptance — now passing

The failure was never in the credentials check. Instrumenting `authorize()` showed the lookup
returning the customer and `bcrypt` comparing **true**; `signIn` threw nothing. The session
cookie was being issued but discarded: the app runs in production mode, so Auth.js emits
`__Secure-authjs.session-token` with the `Secure` flag, and a browser will not keep that from a
plain `http://` origin. Two dead ends came from that single fact: a cookie minted under the wrong
name, and a login that looked like a rejection.

Fix: `scripts/acceptance/tls-proxy.mjs` terminates TLS in front of the app, so the local runtime
matches production's cookie policy. No application code was changed to make auth work, no secret
was minted, and the sign-in uses the customer's real password through the app's own Auth.js
credentials endpoint.

Result, on a production build against an isolated database:

| Check | Result |
| --- | --- |
| Credentials accepted by the app's own auth | 302 |
| Session resolves to the signing customer | `owner@acceptance.local` |
| `/workspace/agents` renders, no bounce | 200 |
| Agent created in the UI is listed after reload | pass (`Agents (3)`) |
| `/workspace/schedules` renders, no bounce | 200 |
| Schedule created in the UI is listed after reload | pass (`Schedules (2)`) |
| `/workspace/launch` renders, no bounce | 200 |
| Launch plan created in the UI is listed after reload | pass (`Launch plans (2)`) |

Screenshots: `acceptance/agents.png`, `acceptance/schedules.png`, `acceptance/launch.png`
(1440×1182, full page).

### Defect found and fixed by the browser run

`/workspace/agents` crashed on load with `TypeError: Cannot read properties of undefined
(reading 'length')` and unmounted the page. The render tested `allowedTools === null`, but the
API **omits** the field for identities that predate tool assignment, so the value was `undefined`
and the guard fell through to `.length`. Fixed to test the shape (`Array.isArray`) and to label
the state "all tools (legacy, not assigned)". The type now admits an absent field. This was
invisible to the unit suite because it is a render path, not an authorization path.

### Open anomaly, not fixed

On the server-action login path, the response sets `__Secure-authjs.csrf-token` and
`__Secure-authjs.callback-url` but **not** `__Secure-authjs.session-token`, while the canonical
`POST /api/auth/callback/credentials` sets it correctly for the same credentials. Google sign-in
is unaffected. Whether email/password sign-in therefore fails in production is unproven: it needs
one login attempt with a real password account on zooka-ai.com. Recorded rather than guessed.

## Blocked

Nothing in Phase 0 remains blocked. Production work still awaits the owner's approval of the
release commit, migration plan, deployment plan and rollback procedure.
