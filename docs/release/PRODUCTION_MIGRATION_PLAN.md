# Production migration plan: 0028–0049 (not applied)

Prepared 2026-11-16 for RC-1. Nothing in this document has been executed against
production. Every claim below comes from two local artifacts: the pending migration files
in this branch, and a schema-only dump of the production database taken with `pg_dump`
17.12 from a server reporting PostgreSQL 17.6.

## 1. Finding that changes the order

The pending set assumes tables that production does not have. Comparing the 22 pending
migrations against the production dump:

| Pending migration | Assumes | Present in production |
| --- | --- | --- |
| `0028_agent_tenant_scope` | `AgentIdentity`, `AgentTask`, `AgentDecision`, `AgentApproval`, `AgentDeployment` | **no** |
| `0033`, `0038`, `0040`, `0041` | the same agent tables | **no** |
| `0035` | `AgentExecution` (creates it) plus `integration_connection` | AgentExecution no, integration_connection **yes** |

`0028` opens with:

```sql
ALTER TABLE "AgentIdentity" ADD COLUMN IF NOT EXISTS "organizationId" varchar(64) NOT NULL DEFAULT 'unclaimed';
```

`IF NOT EXISTS` there qualifies the **column**, not the table. Run against a database that
has no `AgentIdentity`, that statement fails with `42P01 relation "AgentIdentity" does not
exist` and the run stops on the first line. So a plan that starts at 0028 fails on
production, and it fails immediately rather than halfway.

The missing tables are created by two migrations that sit in the base set, not in the
pending set:

| Prerequisite | Creates |
| --- | --- |
| `0017_client_projects.sql` | `Project` (+ `Project_organizationId_idx`) |
| `0027_agent_command_center.sql` | `AgentIdentity`, `AgentTask`, `AgentDecision`, `AgentApproval`, `AgentDeployment` (+ their indexes) |

Both were checked for the two ways a prerequisite can hurt a populated database:

- no `ALTER TABLE` against any table production already has (the only `ALTER`s in 0027
  target tables that same file creates),
- no `CREATE TYPE`, so none of the enum re-run problem the base `0000–0013` set has,
- every `CREATE TABLE` and `CREATE INDEX` is guarded, so re-running them is a no-op.

That makes 0017 and 0027 safe to apply to a database with live rows: they only add six
empty tables and their indexes.

## 2. The plan

Run during a declared window, with the application still serving the previous commit.

### Step 0: preflight (read only)

```sql
select count(*) from information_schema.tables
  where table_schema='public' and table_type='BASE TABLE';              -- expect 40
select to_regclass('public."Project"'),
       to_regclass('public."AgentIdentity"'),
       to_regclass('public."AgentTask"');                               -- expect null,null,null
select count(*) from "User";                                            -- record
select count(*) from "Chat";  select count(*) from "Message";
select count(*) from "Document"; select count(*) from "integration_connection";
```

Abort if the table count is not 40, if any prerequisite table already exists, or if the
runtime role `zooka_runtime` already exists with different attributes than 0031 expects.

### Step 1: backup, before anything else

`GET https://zooka-ai.com/api/admin/backup` with the `x-backup-token` header. Confirm HTTP
200 and a byte size in the expected range (the 2026-11-16 baseline was 854,794 bytes).
Store it private: the dump contains password hashes and customer email addresses. Do not
continue without this file.

### Step 2: prerequisites

Apply, in this order, one at a time, stopping on the first error:

1. `0017_client_projects.sql`
2. `0027_agent_command_center.sql`

Verify after each: the expected tables exist, every other table's row count is unchanged,
and the live site still answers 200 on `/` and `/login`.

### Step 3: the pending ladder

`0028` → `0049`, numeric order, one transaction each, stopping on the first failure. The
self-hosted runner (`scripts/selfhost/migrate.ts`) refuses production hosts by design, so
this step is run explicitly by the owner or by an operator with the production URL, never
by the script as configured.

Notable migrations in this range:

| Migration | What it does | Care |
| --- | --- | --- |
| `0029` | `EmailVerification` table, unique index on `lower(email)` | the unique index fails if duplicate emails exist; check first: `select lower(email), count(*) from "User" group by 1 having count(*)>1;` |
| `0030`, `0046`, `0047`, `0048` | RLS policies | policy creation only; no data change |
| `0031` | creates `zooka_runtime` (LOGIN, NOSUPERUSER, NOBYPASSRLS), revokes `CREATE` on `public` | password is set separately afterwards, never in the migration |
| `0034`, `0035`, `0039`, `0042`, `0043`, `0044`, `0045` | new tables (executions, leases, launch plans, documents, browser sessions, studio media, spend approvals) | additive |
| `0035` | `CREATE TABLE IF NOT EXISTS integration_connection` | already exists in production; guarded, so it is a no-op. Its indexes and grants still apply |
| `0036`, `0037`, `0038`, `0040`, `0041` | `ALTER` for soft delete, verification timestamps, schedules, tool allowlists, projects | all `ADD COLUMN IF NOT EXISTS`; 0038 and 0041 also backfill defaults |
| `0049` | runtime grants, including the `OrganizationMember` grant that broke Preview login | must land before the new commit serves traffic |

### Step 4: post-migration verification

```sql
select count(*) from information_schema.tables where table_schema='public';  -- expect 46+
select count(*) from pg_policies where schemaname='public';                  -- expect >= 37
select count(*) from "User";                                                 -- unchanged
select count(*) from "Chat";  select count(*) from "Message";                -- unchanged
select rolname, rolsuper, rolbypassrls from pg_roles where rolname='zooka_runtime';  -- f,f
```

Then, in order: `POST /api/admin/migrate` (expect 200 with `failed={}`), a real login, one
document creation through the worker, and a cross-tenant read that must return 404.

### Step 5: deploy

Only after Step 4 passes. Deploy the release commit, then repeat the four checks from Step
4 against the live domain. The previous deployment stays available for immediate rollback.

## 3. Rollback

Reverse order, newest first, and only for migrations this run actually applied:

1. `0049` → `0028` using each `.down.sql`.
2. `0027` and `0017` down files, which drop six empty tables.
3. Restore the backup taken in Step 1 only if a rollback fails or data is inconsistent.

Five rollbacks refuse to run while their table holds rows, which is deliberate:
`0029`, `0034`, `0035`, `0038`, `0039`. If one of those blocks, the choice is to keep the
table or to accept data loss explicitly. Nobody should clear a populated table to make a
rollback pass.

## 4. Data preservation summary

- Prerequisites add six empty tables. No production table is altered.
- The pending set is additive: it adds tables, columns and policies. The only destructive
  statements are inside `.down.sql` files, and those are guarded.
- The one real data risk is `0029`'s unique index on `lower(email)`, which needs a duplicate
  check first. That check is in Step 3.
- Backup first, always. The migration is not the risky part; running it without the dump is.

## 5. Status

Prepared, reviewed against the production dump, **not executed**. Production is on the
schema shown in `schema17.sql`: 40 tables, none of the agent-core tables, no
`zooka_runtime` role. The application code on `release/rc-1` expects the post-migration
shape, which is exactly why this runs before the deploy and never after it.
