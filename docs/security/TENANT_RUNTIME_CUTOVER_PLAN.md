# Tenant runtime cutover plan (production)

Status: **NOT EXECUTED**. This is the plan the owner approves or rejects before any production
change. Nothing in this document has been applied: production still runs on the owner connection,
`DATABASE_URL` is unchanged, and no role or grant has been touched outside an isolated local cluster.

Measured on 2026-11-18 against production (`zooka-ai.com`, commit `98a39f3`) and re-verified on an
isolated PostgreSQL 17 cluster built from the migration files.

## 1. Current state

| Property | Production today | Target |
|---|---|---|
| Connecting role | `postgres` (owner of every public table) | `zooka_runtime` |
| `rolbypassrls` | `true` on the owner role | `false` |
| `rolsuper` | `false` | `false` |
| RLS enabled | 72 of 72 public tables | unchanged |
| RLS actually enforced on normal queries | **no** (owner bypasses) | yes |
| Policies relying on `app.organization_id` | 0 (46 rewritten to `app_platform_org()`) | unchanged |
| Policies relying on `request.jwt.claims` membership | 5, written by both tenant runners | unchanged |

The gap is real but narrow: the policies work, and the runtime role is proven to respect them, but
production queries run as a role that is allowed to ignore them. Enforcement therefore depends on
application code never asking for the wrong tenant, which is a code guarantee, not a database one.

## 2. Proposed restricted role

`zooka_runtime` already exists in the migrations with the right shape:

```
LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT
```

It is a member of nothing, owns no table, and cannot `SET ROLE`. Migration `0058` gives it the DML
it needs on every table that carries `organizationId` (measured: 184 grants, 48 tables readable),
withholds `DELETE` on `AgentExecution` because an execution row is audit evidence, and withholds
`INSERT`/`DELETE` on `User` and `Organization` because accounts and workspaces are created by the
bootstrap connection during registration. The migration asserts each of these and fails if one does
not hold.

## 3. Required grants (already in the migration, listed for review)

- `SELECT, INSERT, UPDATE` on every tenant table; `DELETE` on the same set except `AgentExecution`.
- `SELECT, UPDATE` on `User` and `Organization`; no `INSERT`, no `DELETE`.
- `USAGE, SELECT` on sequences in `public` (inserts need them).
- No `CREATE` on schema `public`.
- No privilege at all on the 24 service-only tables (`Account`, `Session`, `VerificationToken`,
  `PasswordResetToken`, `PhoneOtp`, `SchedulerRun`, `WebhookEvent`, growth/reward ledgers, legacy
  tables). Those stay on the bootstrap connection.

## 4. RLS enforcement

`ENABLE` is already on everywhere. `FORCE` is on for the five Commander tables and is **not** the
mechanism to rely on here: the runtime role is not the owner, so `ENABLE` alone is enough for it.
`FORCE` matters only if ownership is ever transferred to the application role, which this plan does
not propose.

## 5. Environment variable changes

| Variable | Today | After |
|---|---|---|
| `DATABASE_URL` | Neon owner URL | unchanged (bootstrap, migrations, `adminDb()`) |
| `DATABASE_URL_TENANT` | absent in production | `zooka_runtime` URL for the same database |
| `TENANT_RLS_ENABLED` | absent in production | `on` |
| `DATABASE_URL_SERVICE` | present in preview only | optional; verify before use |

The role's password is set out of band (`ALTER ROLE … PASSWORD` from the secret manager) and never
appears in the repository, in a migration, or in a chat message.

## 6. Deployment sequence

1. **Rehearsal (no production impact).** Take a production dump, restore it into an isolated cluster,
   apply `0058`, connect as `zooka_runtime`, and run the isolation matrix. Stop here if any assertion
   fails.
2. **Approve the guard change.** `lib/db/tenant-client.ts` refuses production hosts by design
   (`FORBIDDEN_HOSTS`). Removing that refusal is the one code change this plan needs, and it is a
   reviewed pull request with the isolation matrix as its evidence, not an environment tweak.
3. **Apply `0058` to production** through the existing migration route. It is additive: grants and
   assertions only, no DDL on tables, no RLS change, no data change. Verify `failed = {}` and the new
   grant assertions in the response.
4. **Smoke on a preview deployment** with `DATABASE_URL_TENANT` and `TENANT_RLS_ENABLED` set: sign in,
   open the workspace, send one agent message, list projects, open the n8n overview, revoke an MCP key.
5. **Production flip** of the two variables, one deployment, then the smoke set again.
6. **Freeze the old path.** Leave `DATABASE_URL` untouched; do not delete the owner connection until a
   full billing cycle has passed with no incident.

## 7. Smoke tests after the flip

Expected result for each, as the runtime role only:

| Check | Expected |
|---|---|
| Sign in with an existing account | 200, session cookie issued |
| `/workspace` and `/workspace/home` | 200 with real counters |
| One agent message | reply, `AgentMessage` +2, `UsageEvent` +1 |
| Projects list | only the caller's workspace rows |
| n8n overview | stage measured, never a stored "connected" |
| MCP key revoke | 401 on the same key afterwards |
| A second account's project id pasted directly | 404 or empty, never the row |

## 8. Monitoring

- `pg_stat_activity` filtered to `usename = 'zooka_runtime'`: connection count and long transactions.
- Error rate for SQLSTATE `42501` (permission denied) and `42P01`: a spike means a code path still
  needs a grant or still creates a table at request time.
- The migration route's own grant assertions, re-read after every deploy.
- Queue health signal (`/api/agents/health`) must stay `ok`; under the runtime role it now measures
  real rows rather than returning permission errors.

## 9. Rollback triggers

Any one of these is enough to roll back without further discussion:

- Any 500 on sign-in, workspace, chat or billing attributable to `42501`.
- A support report of seeing another workspace's data, however brief.
- MCP key creation or revocation failing.
- Sustained `42501` above a handful per minute.

## 10. Rollback procedure

1. Remove `DATABASE_URL_TENANT` (or unset `TENANT_RLS_ENABLED`). The tenant runners fall back to the
   bootstrap connection: no deploy needed, effective on the next request.
2. If a deployment is already live, redeploy the previous commit; production returns to the owner role.
3. Grants are harmless to leave in place: the owner already has everything, and `0058`'s down file is
   deliberately a no-op because revoking them would break the runtime role for no benefit.
4. Restore from the pre-cutover dump only if data was written incorrectly, not for a permission error.

## 11. What this plan does not do

- It does not transfer table ownership, so `FORCE ROW LEVEL SECURITY` stays cosmetic for the owner.
- It does not make `app.organization_id` trustworthy: the platform policies were already rewritten to
  derive identity from `request.jwt.claims`, and that rewrite is the load-bearing part, not the role.
- It does not address the browser engine or the three status cards; those are separate.

## 12. Cost

Zero. No new service, no new plan, no extra build beyond the one production deploy that any code
change needs. The rehearsal runs on the existing isolated cluster.
