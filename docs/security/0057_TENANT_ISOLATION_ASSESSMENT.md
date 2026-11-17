# Migration 0057 — Tenant Isolation Security Assessment

**Date:** 2026-11-18
**Scope:** production database `krzfrsaquvmwctsajhlm` (Supabase, Singapore), migration `0057_runtime_least_privilege_guard`
**Status:** migration **not applied**, `DATABASE_URL` **unchanged**, no permission modified, no row deleted.
**Verdict:** see [§13](#13-go--no-go).

Every number below was read from the production catalog on 2026-11-18 with the read-only
audit (`scripts/audit/runtime-role-audit.sql` and the queries in this file). Nothing here is
estimated. Where a measurement could not be taken, it says so instead of guessing.

---

## 1. Exact current production role permissions

The application does **not** connect as `zooka_runtime`. Measured from `pg_stat_activity`
while the site served requests: the application sessions are `postgres`. Pooler sessions
appear as `pgbouncer`.

| role | can login | superuser | bypasses RLS | create db | create role | used by |
| --- | --- | --- | --- | --- | --- | --- |
| `postgres` | yes | no | **yes** | yes | yes | the application today (`DATABASE_URL`) |
| `zooka_runtime` | yes | no | no | no | no | nothing yet; prepared for the cutover |
| `anon`, `authenticated` | no | no | no | no | no | Supabase client roles, unused by this app |
| `service_role` | no | no | yes | no | no | Supabase service key, unused by this app |

Because `postgres` is `rolbypassrls = true`, **row level security is not enforced on the
application's own queries today**, even though all 72 tables have it enabled. Enabling RLS
without moving the connection is therefore cosmetic; moving the connection is the real fix.

`zooka_runtime` privilege inventory (`information_schema.role_table_grants`):

| privilege | tables |
| --- | --- |
| SELECT | 48 |
| INSERT | 45 |
| UPDATE | 47 |
| DELETE | 45 |
| sequences (USAGE) | 4 (`token_grants_id_seq`, `creative_usage_id_seq`, `agent_memory_id_seq`, `integrationaudit_id_seq`) |
| CREATE on schema `public` | **none** |
| role memberships | none |
| owns relations | none |

The four lowercase-UUID/serial tables are the only ones with sequences; the rest use
`gen_random_uuid()`, so the four sequence grants are complete.

**Unmeasured, declared:** a live `zooka_runtime` connection test was not possible. Its
password is not in the vault and changing it would be a permission change, which this
assessment must not perform. Isolation was therefore proven on an isolated engine
rebuilt from the production policy definitions ([§8](#8-cross-tenant-isolation-test-evidence)).

---

## 2. All 72 tables and their RLS coverage

| measure | value |
| --- | --- |
| base tables in `public` | **72** |
| RLS enabled | **72** (100%) |
| RLS disabled | **0** |
| FORCE RLS | 5 (`AgentApproval`, `AgentDecision`, `AgentDeployment`, `AgentIdentity`, `AgentTask`) |
| policies | **78** |
| tables with at least one policy | **53** |
| tables with RLS but no policy | **19** |

The 19 tables with RLS and no policy return **zero rows** to any non-owner role. That is a
deliberate fail-closed state for 17 of them and a dead end for 2 ([§3](#3-missing-or-unsafe-tenant-policies)):
`Account`, `EmailSuppression`, `EmailVerificationToken`, `GrowthAudit`, `GrowthSettings`,
`GuestUsage`, `LaunchTestingClaim`, `PasswordResetToken`, `PhoneOtp`, `ReferralInvite`,
`ReferralProfile`, `RewardLedger`, `SchedulerRun`, `Session`, `VerificationToken`,
`WebhookEvent`, `_selfhost_migrations`, `lead`, `price_snapshot`.

---

## 3. Missing or unsafe tenant policies

**3.1 Two tables carry a tenant column but no tenant policy.**
`RewardLedger` (`organizationId` present) and `lead` (`organization_id` present). Both are
unreachable for `zooka_runtime` today because neither has a grant either, so the exposure is
zero. It becomes a dead end the moment a grant is added: RLS on with no policy returns zero
rows, which is exactly what the previous draft of 0057 would have produced.

**3.2 `app_is_member()` depends on a claim the application never sets.**
The helper is `SECURITY DEFINER` and evaluates `auth.uid()`, which reads
`request.jwt.claim.sub` or `request.jwt.claims`. The application sets only
`app.organization_id` and `app.user_id` (`lib/db/tenant-client.ts:131,137`); a search of
`lib/` finds no `request.jwt.claims` writer. Measured on the replica:
`app_is_member(<org>)` returns **false** with `app.user_id` set and **true** only after the
JWT claim is written. Member-scoped policies (`Chat_member_read`,
`Message_v2_member_read`, `Subscription_member_read`, `Organization_member_read`,
`integration_connection_member_write`) are therefore dead today. Nothing breaks only
because each of those tables also carries an `app.organization_id` policy and permissive
policies OR together. That redundancy is accidental, not designed, and it should not be
leaned on silently.

**3.3 Read-all policies are limited to reference data.**
Only three policies have `USING (true)`: `BlogPost.public_read` (public blog),
`Affiliate.affiliate_reference_read` (referral code reference), and
`integration_provider.provider_read_all` (connector catalogue). No customer-owned table has
an open policy.

**3.4 Default privileges weaken "no grant" as a guarantee.**
`pg_default_acl` grants `arwdDxtm` to `anon`, `authenticated` and `service_role` on every
future table and sequence created by `postgres` or `supabase_admin`. RLS is the only thing
standing between `anon` and a new table. If a future migration forgets `ENABLE ROW LEVEL
SECURITY`, that table ships publicly readable. This is a real risk and it is not fixed by
0057; it is recorded here as a follow-up (revoke default privileges for `anon`/
`authenticated`, or add an RLS-mandatory guard test).

---

## 4. Corrected forward migration SQL

`lib/db/migrations/pending/0057_runtime_coverage_gaps.sql` — rewritten. The earlier draft
granted `SELECT/INSERT/UPDATE/DELETE` on all 24 unread tables and created tenant policies
where RLS was missing. Both halves were wrong for this database: all 72 tables already have
RLS, and the 24 unread tables are service-only by design. Granting them would have widened
the runtime blast radius from 48 to 72 tables and handed a compromised runtime role the
token hashes in `Account`, `Session`, `VerificationToken`, `PasswordResetToken` and
`PhoneOtp`.

The corrected file **grants nothing**:

1. `REVOKE ALL PRIVILEGES` from `zooka_runtime` on the 24 service-only tables, so a future
   careless `GRANT` cannot quietly widen the boundary.
2. Asserts and **fails the deployment** if any invariant breaks: runtime role is superuser,
   bypasses RLS, holds `CREATE` on `public`, or can read a table that has RLS off or no
   policy.
3. Reports the closed tables as `NOTICE`.

No `CREATE`, `ALTER ROLE`, password change, `DISABLE`/`FORCE ROW LEVEL SECURITY`, or `GRANT`
appears anywhere in the file. It is idempotent and returns quietly when `zooka_runtime`
does not exist.

Two defects were found and fixed by running it, not by reading it: `array || 'text'` is not
valid for `text[]` and produced `malformed array literal` instead of the intended message
(now `array_append`), and a `pg_class`/`pg_namespace` join filtered by
`has_table_privilege(text)` fails to plan on the isolated engine (now
`relnamespace = 'public'::regnamespace`).

---

## 5. Complete rollback SQL

`lib/db/migrations/pending/0057_runtime_coverage_gaps.down.sql` is an explicit no-op with a
`NOTICE`. That is the correct rollback: the up file creates nothing and grants nothing, so
the only thing a "rollback" could do is re-grant service-only tables to the runtime role,
which would be a regression wearing a rollback's clothes.

The rollback that actually matters is the cutover rollback, which is one variable:

```
# Vercel → Settings → Environment Variables → production
DATABASE_URL = <previous owner-connection string>   # value already in the project history
TENANT_RLS_ENABLED = off
# redeploy; the Proxy in lib/db/queries.ts:117 resolves to the owner connection again
```

`lib/db/queries.ts:69` documents the same single-variable reversal, which is why the cutover
is cheap to undo inside the change window.

---

## 6. Least-privilege runtime role design

| property | value | why |
| --- | --- | --- |
| attributes | `LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT` | RLS must apply to it |
| memberships | none | no `SET ROLE` escalation path |
| schema `public` | `USAGE` only, never `CREATE` | cannot invent objects |
| table grants | 48 tenant tables, CRUD | the surfaces a request needs |
| sequence grants | the 4 owned sequences | inserts with serial ids |
| service-only tables | 24, no privileges | auth bootstrap and platform ledgers |
| second connection | `DATABASE_URL_SERVICE` | bootstrap writes with no tenant scope |

The split that makes this safe: **one connection for tenant requests, one for bootstrap.**
`adminDb()` already routes membership, subscription, growth and webhook writes to the
service connection; `lib/db/queries.ts:100` raises a loud error when tenant RLS is enabled and
`DATABASE_URL_SERVICE` is missing, instead of failing later as an ambiguous policy error.

---

## 7. Authentication bootstrap compatibility

Every pre-tenant read stays on the service connection, and each has a measured consumer:

| table | path | connection |
| --- | --- | --- |
| `Account`, `Session`, `VerificationToken` | NextAuth session and credential lookup | `adminDb()` |
| `EmailVerificationToken` | `lib/auth/verification.ts` | `adminDb()` |
| `PasswordResetToken` | `createPasswordResetToken` | `adminDb()` |
| `PhoneOtp` | `lib/auth/phone-otp.ts` | `adminDb()` |
| `EmailSuppression` | mail suppression check | `adminDb()` |
| `GuestUsage` | anonymous quota | `adminDb()` |
| `WebhookEvent`, `SchedulerRun` | `lib/webhooks/events.ts`, `lib/agents/health.ts`, `lib/agents/scheduler.ts` (`withPlatformClient`) | service/platform |

The bootstrap writes that must not be policy-bounded (creating the organization that creates
the tenant) already go through `DATABASE_URL_SERVICE`. So authentication and registration
survive the cutover **provided `DATABASE_URL_SERVICE` exists in production**; today it is
configured in preview only. That is blocker B3.

---

## 8. Cross-tenant isolation test evidence

Environment: isolated in-process PostgreSQL 18 engine (PGlite 0.5.16), schema and policies
copied verbatim from the production catalog: `Chat`, `Message_v2`, `token_wallets`,
`mcp_api_key`, `integration_connection`, `OrganizationMember`, the real
`app_is_member()` definition, and the real `auth.uid()`. Two organizations seeded, three
chats, three messages, two wallets, two keys, two encrypted connector rows.
Harness: `scripts/audit/verify-tenant-isolation.mjs`, run as `zooka_runtime` (role created
with production attributes; `SET LOCAL ROLE` inside a transaction, always rolled back).

```
PASS  no context sees no chats                        (rows=0)
PASS  org A sees only its 2 chats                      (rows=2)
PASS  org B sees only its 1 chat                       (rows=1)
PASS  org A cannot read org B chat by id               (rows=0)
PASS  org A cannot update org B chat                   (rows=0)
PASS  org A cannot delete org B chat                   (rows=0)
PASS  org A cannot insert a wallet for org B           (42501)
PASS  messages follow the chat's tenant                (rows=2)
PASS  org A reads its own wallet only                  ([500])
PASS  org A cannot see org B integration tokens        (["A secret"])
PASS  app_is_member is false with app.user_id alone    (false)
PASS  app_is_member is true once the JWT claim is set  (true)
PASS  runtime cannot create a table
PASS  runtime cannot disable RLS
14/14 checks passed
```

The two `app_is_member` results are the finding in §3.2, reproduced as a test so it cannot be
forgotten. The guard migration itself was verified separately on the same engine, 9/9
(`scripts/audit/verify-0057-guard.mjs`): stray grant revoked, tenant access preserved,
second run a no-op, down restores nothing, a granted table with RLS off raises and names the
table, a `BYPASSRLS` role raises, a missing role is a quiet no-op.

**Not covered:** concurrency, pooler behaviour under `zooka_runtime`, and real data volume.
Those need the live role password, which is why the cutover stays gated.

---

## 9. Billing, browser, agents and MCP impact

| surface | tables | policy | verdict under cutover |
| --- | --- | --- | --- |
| Billing (Stripe webhook) | `Subscription` | `tenant_isolation` on `organizationId` + `Subscription_member_*` | OK. The webhook writes through the service connection (`syncWorkspaceSubscription`), so no tenant context is needed. |
| Billing (checkout, wallets) | `token_wallets`, `token_grants`, `creative_credits` | `tenant_isolation` on `organization_id` (text) | OK with tenant context. `chargeWallet` uses the shared client, so every caller must be wrapped in a tenant transaction. |
| Browser | `BrowserSession`, `BrowserEvent`, `BrowserEvidence` | `tenant_isolation` on `organizationId` | OK; all three are granted and org-scoped. |
| Agents | `AgentExecution`, `AgentTask`, `AgentMessage`, `AgentSchedule`, `AgentApproval`, `AgentProject`, `AgentIdentity`, `AgentDecision`, `AgentDeployment` | `tenant_isolation` on `organizationId`, five with FORCE | OK for request paths. The scheduler runs through `withPlatformClient` (platform connection), so background work is unaffected. |
| **MCP** | `mcp_api_key` | `tenant_isolation` on `organization_id` | **BLOCKER B1.** |
| Growth / referral / launch | `RewardLedger`, `GrowthSettings`, `GrowthAudit`, `ReferralProfile`, `ReferralInvite`, `LaunchTestingClaim` | RLS on, no policy | OK today (all callers use `adminDb()`); stays closed on purpose. |

### Blocker B1 — MCP dies at the cutover, silently

`verifyMcpKey()` (`lib/db/mcp-keys.ts:123`) looks the key up **by hash with no tenant
context**:

```
SELECT id, organization_id, created_by_user_id FROM mcp_api_key
WHERE key_hash = $1 AND revoked_at IS NULL LIMIT 1
```

Under `zooka_runtime` this returns zero rows because the policy compares `organization_id`
against an unset `app.organization_id`, and the failure is swallowed by `catch { return null }`.
The user-visible result would be "invalid key" on every MCP request, with no error in the
logs to explain it. `touchMcpKey()` has the same problem on its `UPDATE ... WHERE id = $1`:
`last_used_at` would stop updating, again silently.

The fix is a three-line change and belongs to the cutover PR, not to 0057: key verification
is pre-tenant authentication, exactly like `Session` and `VerificationToken`, so it must use
the service connection (`adminDb()`).

---

## 10. Production cutover sequence

Prerequisites, all measured today: migration applied (guard passes), B1 fixed, B2 fixed or
accepted in writing, B3 verified (`DATABASE_URL_SERVICE` present in production).

1. **Freeze and back up.** `GET /api/admin/backup` with `x-backup-token`; confirm HTTP 200,
   `restoreReady: true`, and a row count that matches the previous night. Store in private
   storage only (the dump contains password hashes).
2. **Apply 0057.** `POST /api/admin/migrate` after adding the migration to the runner's key
   list. Expect 200, `failed = {}`, and the guard's `NOTICE` lines. Because the file grants
   nothing, this step changes no access and can be run hours before the switch.
3. **Verify the deployment invariant.** `zooka_runtime` still holds 48 tables, no `CREATE`,
   `rolbypassrls = false`.
4. **Switch one variable.** Set `DATABASE_URL` to the `zooka_runtime` connection string
   (pooler, `sslmode=require`), keep `DATABASE_URL_SERVICE` untouched, set
   `TENANT_RLS_ENABLED = on` (a value different from `DATABASE_URL`, or the isolation guard
   refuses it).
5. **Deploy and watch 10 minutes.** Functional gates in this order: `/api/auth/providers`
   200, `/login` 200, register a throwaway account, sign in, open `/workspace`, send a chat
   message (proves `Chat` + `Message_v2`), open `/workspace/admin/growth` (service path),
   issue an MCP key and call `tools/list` (proves B1), export CSV from `/workspace/admin/growth`.
6. **Check the database side while traffic flows.** `pg_stat_activity` must show
   `zooka_runtime` for the application and `postgres` only for bootstrap; `UsageEvent` must
   grow; `last_used_at` on the MCP key must update.
7. **Soak 48 hours** before declaring isolation live in the release notes.

---

## 11. Downtime and failure scenarios

Expected downtime: **zero**. The switch is an environment variable plus a redeploy; Vercel
keeps the previous deployment live until the new one is READY, and reverting is the reverse
of one variable.

| scenario | symptom | response |
| --- | --- | --- |
| A tenant path runs without context | reads return 0 rows, writes refused; pages look empty rather than erroring | roll back the variable, then find the unwrapped call with the tenant-coverage guard test |
| `DATABASE_URL_SERVICE` missing | registration and membership writes fail loudly (`queries.ts:100`) | roll back; the error names the variable |
| Pool exhaustion | timeouts under load, `too many clients` | the pooler is already in front; verify the runtime role's connection limit before switching |
| Prepared-statement mode mismatch | sporadic `prepared statement already exists` | confirm the pooler is in transaction mode and the client sends unnamed statements |
| Guard raises during migrate | migration fails with the offending table named | expected behaviour: fix the grant/policy, rerun; nothing was changed |
| MCP 401 storm | every key rejected | B1 was not fixed; roll back the variable |

## 12. Recovery and rollback triggers

Roll back (one variable, then redeploy) if any of these appears within the change window:

- HTTP 5xx above 1% for 10 minutes, or any sustained 500 on `/workspace`.
- Registration or sign-in failing for any real attempt.
- Chat messages not persisting (`Message_v2` count flat while sessions are active).
- MCP keys rejecting, or `last_used_at` frozen.
- Any page showing an empty list that was populated before the switch.
- `pg_stat_activity` showing the application back on `postgres` after the switch (means the
  variable did not take).

Recovery after rollback: re-run the section 10 gates on the owner connection, confirm counts
match the backup, then investigate offline. No data is at risk in either direction: the
migration writes nothing and the connection change is stateless.

---

## 13. GO / NO-GO

**Migration 0057 (the file): GO.** It grants nothing, revokes only what should never have been
granted, asserts the invariants, and fails closed. The isolated engine passes 9/9, including
the two failure modes it exists to catch. Applying it changes no access and is safe to run
ahead of the cutover.

**Cutover to `zooka_runtime` (the switch): NO-GO today.** Three items are open, in order of
severity:

- **B1 (blocker, 3 lines):** `verifyMcpKey`/`touchMcpKey` use the tenant client with no
  context; every MCP request would start failing as "invalid key" with no log evidence.
- **B2 (blocker, design):** `app_is_member()` reads `request.jwt.claims`, which the app never
  sets, so five member policies are dead. Either write the claim when the tenant context is
  set, or rewrite the helper against `app.user_id`.
- **B3 (verification):** `DATABASE_URL_SERVICE` must exist in production, not preview only.

After B1 and B2 are fixed and B3 is verified, the cutover is a 10-minute change with a
one-variable rollback. The isolation itself is already proven: 14/14 on the production policy
set, with no path that returns another tenant's row.

**Unproven by design, and stated as such:** a live connection as `zooka_runtime` against
production, concurrency behaviour, and pooler behaviour under real load. Those require the
role password or the switch itself, and this assessment was required to leave both alone.
