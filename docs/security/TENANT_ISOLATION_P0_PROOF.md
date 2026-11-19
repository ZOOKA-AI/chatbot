# Tenant isolation — P0 proof before commercial launch

Scope of this round: non-production only. Nothing here changes Production, its
connection string, its database role, DNS, or a secret.

- Base: `main` at `5985c0a`
- Method: the repository migration chain applied to a fresh, isolated PostgreSQL 17
  cluster, then the isolation suites run one per pristine database with
  `TENANT_RLS_ENABLED=on`, so no suite can inherit another suite's state.

## 1. What was wrong in the gate, not only in the proof

Two suites were reporting on a configuration that no longer exists, so the gate could
not be trusted in either direction:

| Defect | Why it matters |
|---|---|
| `tests/unit/tenant-coverage-guard.test.ts` exempted `app/(chat)/admin/page.tsx` as "intentionally cross-tenant" | The page has since become tenant-scoped (`adminPageContext()` → `getCommandOverview(admin.organizationId)`). A stale exemption is a standing permission to leave a file unscoped, so the guard failed on its own dead entry and would have hidden a real regression in that file. |
| `tests/unit/agent-permission-boundaries.test.ts` used `organizationId: "org-alpha"` | `runInTenantTransaction` validates the organisation as a UUID. With enforcement on, all ten assertions died on `TenantScopeError: organisation is not a valid identifier`; they only passed while the isolation flag was **off** — the exact configuration the suite exists to prove safe. |

Both are fixed on this branch: the exemption is deleted, and the fixtures use a real
UUID. No production code changed.

## 2. Database connection paths (measured on this SHA)

| Path | Handle / variable | Role |
|---|---|---|
| Ordinary request queries | `db` in `lib/db/queries.ts` → `DATABASE_URL` | owner of the schema |
| Admin / bootstrap / pre-tenant identity | `adminDb()` (15 files) → `DATABASE_URL` | owner of the schema |
| Tenant-scoped work | `runInTenantTransaction` (5 files), `withTenantScope` (1 file) → `DATABASE_URL_TENANT` | `zooka_runtime` |
| Platform-level work | `withPlatformClient` (2 files) → `DATABASE_URL_PLATFORM` | platform role |
| Service-level work | `DATABASE_URL_SERVICE` (5 files) | service role |
| Migrations | `scripts/selfhost/migrate.ts` → `DATABASE_URL` | owner |

`DATABASE_URL_PLATFORM`, `DATABASE_URL_SERVICE` and `DATABASE_URL_TENANT` exist in
Preview; Production carries `DATABASE_URL` and the Stripe variables. Values were never
read or printed.

**Blocker B4, still open.** `lib/db/tenant-client.ts:35` holds
`FORBIDDEN_HOSTS = ["krzfrsaquvmwctsajhlm", "bylfizytgayoefuyliix"]` and throws
`refusing to run tenant-scoped work against a production project`. The tenant path is
therefore not usable against Production by construction, so "Production runs as the
owner role" follows from the code and remains unverifiable from here: port 5432 is
blocked from this sandbox and there is no read-only SQL route to Production.

## 3. Role evidence (isolated cluster, no secrets)

```
rolname        rolsuper rolbypassrls rolcreatedb rolcreaterole rolinherit
zooka_runtime  f        f            f           f             f
```

- table privileges held by `zooka_runtime`: **204**
- usage privileges held by `zooka_runtime`: **3**
- tables in `public`: **67** · RLS enabled: **67** · RLS forced: **5**

Migration chain: 28 root migrations plus every file in `pending/` through
`0060_zooka_mail.sql`, `failed = {}` on every database.

## 4. Tenant A / Tenant B matrix

Executed per suite on its own pristine database, `TENANT_RLS_ENABLED=on`.

| Suite | Executed | Passed | Failed | Skipped |
|---|---|---|---|---|
| `tenant-real-connection` | 11 | 11 | 0 | 0 |
| `tenant-coverage-guard` | 4 | 4 | 0 | 0 |
| `tenant-db-proxy` | 2 | 2 | 0 | 0 |
| `tenant-scope` | 14 | 14 | 0 | 0 |
| `agent-authorization` | 7 | 7 | 0 | 0 |
| `agent-permission-boundaries` | 10 | 10 | 0 | 0 |
| `commander-tenant-end-to-end` | 5 | 5 | 0 | 0 |
| `commander-tenant-isolation` | 12 | 12 | 0 | 0 |
| **Total** | **65** | **65** | **0** | **0** |

What the passing assertions actually establish, over independent connections:

- the application role is a real login with no privilege escape (no superuser, no
  BYPASSRLS, cannot disable RLS, does not own the tables);
- RLS is enforced for that role, not merely present, on the protected tables;
- two connections at the same time see different tenants;
- a reused pooled connection does not carry the previous tenant;
- cross-tenant `INSERT`, `UPDATE` and `DELETE` are refused by the server, and a
  cross-tenant `DELETE` removes nothing rather than merely failing to be seen;
- an invalid tenant context matches nothing (fails closed);
- the Commander list/claim/report/decide/approve paths, and the recent-activity audit
  trail, are per organisation; a gated task cannot be claimed before its own
  organisation approved it, and a rejected approval can never be claimed;
- the shared `db` handle resolves to the request's tenant transaction, so a bypass
  would show identical counts for both organisations and the test fails loudly.

## 5. Denied requests

Denials surface as an explicit failure (403/404/409 or a `TenantScopeError`), never as
another tenant's row and never with a credential in the message. The suites assert the
response status and body, not just the absence of data.

## 6. Commands and exit codes

```
npx tsx scripts/selfhost/migrate.ts        exit 0   failed = {}
npx tsc --noEmit                           exit 0
pnpm build                                 exit 0   Compiled successfully
vitest run <the eight suites>              exit 0   65 executed, 65 passed
```

One run was invalid and is reported as such: all eight suites in a single shared
database, in parallel, produced 10 failures because `0031` opens with
`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM zooka_runtime` and the repair lands
after it. A suite reading through the runtime role inside that window is refused. That
is a test-harness race, not a policy result, and it is why every suite here ran on its
own database.

## 7. Production cutover — prepared, NOT executed

1. Create `zooka_runtime` in Production with `NOSUPERUSER NOBYPASSRLS NOCREATEDB
   NOCREATEROLE NOINHERIT` and a password held only in the secret store.
2. Apply `pending/0058_runtime_grants_repair.sql` and confirm the catalogue assertions
   (204 table privileges, 3 usage privileges, RLS 67/67).
3. Set `DATABASE_URL_TENANT` in Production to that role, then enable
   `TENANT_RLS_ENABLED`.
4. Remove the Production hosts from `FORBIDDEN_HOSTS` in a reviewed change with its own
   rollback, because the guard currently refuses Production on purpose.
5. Canary: `/workspace/home`, `/workspace/browser`, `/workspace/mail`, one Commander
   claim/report cycle, one agent tool call.
6. Watch for `TenantScopeError`, `permission denied`, and any route that answers 403 to
   a legitimate owner.

Required Production mutations: new role, one connection variable, one flag, one code
change to the guard. All four need separate owner approval.

## 8. Rollback

- Application: set `TENANT_RLS_ENABLED` off — every path returns to the shared
  connection, exactly today's behaviour.
- Connection: point `DATABASE_URL_TENANT` back at the previous URL.
- Database: drop the role. No table, policy or migration is altered by the cutover, so
  there is nothing to reverse in the schema.
- `FORBIDDEN_HOSTS` change: revert the commit.

## 9. Unresolved

- Production's actual role remains unverified from this environment (5432 blocked).
- The cutover is blocked on B4, which is an architectural decision, not a variable.
- Concurrent execution of the eight suites on one database is still unsafe; the gate
  runs them in parallel today, so a green gate can hide this race in either direction.
