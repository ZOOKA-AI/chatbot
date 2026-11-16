# Tenant role rollout (0030 + 0031, preview first)

Status: implemented and tested locally, nothing applied, nothing deployed.
Path: `TENANT_RLS_ENABLED` (default off) → dedicated database → `zooka_runtime`.

## 1. What changes, and what does not

Today the application connects as `postgres`, a superuser. Superusers ignore row
level security even with `FORCE ROW LEVEL SECURITY`, so the policies in 0030
currently constrain every role except the one the application uses. That is why
0030 alone is a precondition and not a fix.

After this rollout, tenant-scoped work runs as `zooka_runtime` on its own
connection, and the superuser connection keeps doing the things that legitimately
need it (migrations, backups, retention). Both exist at once; the flag chooses
which path a request takes.

The flag is off, so production behaviour is unchanged today.

## 2. Roles

`zooka_app` (0030) — NOLOGIN privilege holder. Not reachable by a network client.

`zooka_runtime` (0031) — the role that connects. LOGIN, NOSUPERUSER,
NOBYPASSRLS, NOCREATEDB, NOCREATEROLE, NOINHERIT, member of no role, owner of no
protected table. It holds exactly four privileges on exactly five tables
(`AgentIdentity`, `AgentTask`, `AgentDecision`, `AgentApproval`,
`AgentDeployment`) plus `USAGE` on `public` and `CONNECT` on the database.

Design note: it is deliberately **not** a member of `zooka_app`. Membership would
allow `SET ROLE`, a privilege transition that is easy to lose track of; direct
grants give the same access with one state instead of two. 0031 asserts
membership is empty, so this cannot drift.

## 3. Applying it (preview database only)

1. Create the preview database. It must not be a production project; the client
   refuses known production refs on its own.
2. Apply `0027` → `0028` → `0030` → `0031` in that order. Each file carries a
   self-check that raises rather than reporting success with a missing property.
3. Set the password out of band, never in a migration:
   `ALTER ROLE zooka_runtime PASSWORD '<generated>'` from the secret manager.
4. Set on preview only:
   - `DATABASE_URL_TENANT` — the preview connection string, user `zooka_runtime`
   - `TENANT_RLS_ENABLED=on`
   Do not touch `DATABASE_URL` or `POSTGRES_URL`.
5. Deploy the preview. Nothing else changes.

## 4. Rollback

Fastest: set `TENANT_RLS_ENABLED=off` and redeploy. Tenant-scoped requests fall
back to the existing connection path; no data migration to undo, because the
tables are unchanged throughout.

Full: `0031...down.sql` (revokes, then drops the role; it owns nothing, so the
drop is safe), then `0030...down.sql` (drops policies and FORCE, keeps rows).
Rolling 0030 back while the flag is on would remove the protection the flag
assumes, so always lower the flag first.

## 5. Monitoring

Watch these counters from the first hour:

| Signal | Healthy | Meaning if it moves |
|---|---|---|
| `TenantScopeError` code `privileged_role` | 0 | the connection is a superuser: the rollout silently lost its protection |
| `missing_context` / `invalid_context` | low and bounded | a caller is not resolving the workspace server-side |
| RLS-denied write errors | low | a query writes outside its tenant, or no context was set |
| connection errors to `DATABASE_URL_TENANT` | 0 | pool, credentials or host |

Any non-zero `privileged_role` is a stop signal, not a warning: it means the
isolation is absent while requests still succeed.

## 6. Failure handling

- `DATABASE_URL_TENANT` missing or equal to the primary URL → the request throws.
  There is deliberately no fallback to the primary connection: a silent fallback
  is the exact failure this design exists to prevent.
- The database unreachable → the request fails closed. It never retries on the
  privileged connection.
- A transaction that fails mid-write rolls back, so a partial cross-tenant write
  cannot survive.

## 7. Compatibility with existing users

The five Commander tables are unapplied/empty in production, so no live user
depends on this path; there is no data to migrate.

Everything else (chats, documents, billing, integrations) is untouched: it keeps
using the existing connection and is out of scope for this flag. Widening the
runtime role to those tables is a separate decision with its own risk and should
not be folded into this one.

## 8. Trust boundary of `app.organization_id`

The GUC is not a security primitive. Anything with SQL execution on that
connection can set it. The design therefore relies on:

1. only `withTenantScope` writing it, from a context the server resolved;
2. `resolveTenantContext` reading the session and refusing merged
   session-plus-request objects outright;
3. the value bound as a parameter and required to be a UUID;
4. `is_local = true` inside an explicit transaction, asserted by reading it back;
5. a role check that refuses superuser and BYPASSRLS before any work runs.

What it still does not stop: an attacker who already has SQL execution on the
connection. At that point the tenant boundary is the least of the problems, and no
policy in this file would help.
