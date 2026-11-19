# Production runtime least-privilege: audit, migration, rollback

Status: **prepared, not applied.** Production `DATABASE_URL` still points at the
owner role and nothing in this change touches production.

Scope of this document: the database half of the approved phase (A1–A7). The
Google growth connector (B) is a separate change in the same PR.

## 1. What is already true, and what is not yet known

Measured and confirmed earlier:

- production has 84 public tables and row level security enabled on 72 of them,
  with zero tables where RLS was switched off by hand;
- the role `zooka_runtime` exists with `NOSUPERUSER NOBYPASSRLS NOCREATEDB
  NOCREATEROLE`, and DDL plus `SET ROLE postgres` are refused for it;
- with no tenant context it reads 0 rows, and inside workspace A it cannot read,
  update, delete or insert rows that belong to workspace B;
- the application still connects as the owner role, which bypasses RLS, so the
  policies currently protect against the runtime role only;
- row counts before and after every migration so far: 278 users, 278
  organizations, 278 memberships, 278 subscriptions, 63 chats, 315 messages,
  22 documents, 370 usage events.

Not yet known, because the sandbox cannot reach the production port (443 only)
and the migration route runs a fixed list of keys rather than arbitrary SQL:

- which of the 84 tables the runtime role cannot read today;
- which tables have RLS disabled and whether they carry an `organizationId`;
- whether any table added after 0051/0056 was granted.

That is exactly what the audit script answers. It is read-only.

## 2. Audit (run this first, paste the result back)

`scripts/audit/runtime-role-audit.sql` in the Supabase SQL editor or `psql`.
It contains no DDL, no GRANT, no ALTER, and returns counts and object names
only: no row data, no token, no password, no business figure.

Read section F first. Four numbers decide the next step:

| number | meaning | required before cutover |
|---|---|---|
| `runtime_without_select` | tables the runtime role cannot read | must be 0 after 0057 |
| `rls_disabled` | tables with no row level security | 0, or each one individually justified |
| `rls_disabled_with_tenant_column` | tables 0057 will gate itself | informational |
| `rls_disabled_without_tenant_column` | tables 0057 can only report | each one needs a written decision |

Section A must also show `zooka_runtime` with `bypasses_rls = false` and
`is_superuser = false`; section B shows who the app really connects as; section
E must show `CREATE` on schema public is **not** granted.

## 3. The migration

`lib/db/migrations/pending/0057_runtime_coverage_gaps.sql`, with
`...down.sql` beside it. It closes gaps only where the audit proves one exists:

1. `GRANT SELECT, INSERT, UPDATE, DELETE` on public tables the runtime role
   cannot read, plus `USAGE, SELECT` on the sequences those tables own (a
   serial column is unusable without it);
2. `ENABLE ROW LEVEL SECURITY` on tables that have an `organizationId` column
   and no RLS yet, with one policy named `runtime_coverage_tenant` keyed on
   `app.organization_id`;
3. `RAISE NOTICE` for any table with no RLS and no tenant column, so that gap is
   a named decision rather than silent exposure.

It never creates or drops a table or a role, never grants `CREATE` on schema
public, never alters a role, never drops a password, never disables RLS, and
never adds `FORCE ROW LEVEL SECURITY`. The bootstrap tables (`EmailVerification
Token`, `PasswordResetToken`, `GuestUsage`, `Affiliate`, `SchedulerRun`,
`WebhookEvent`, `PhoneOtp`, `_selfhost_migrations`) are in a skip list: they are
reachable through the service connection only, by design.

Idempotent: every statement is guarded, and it reports and returns when
`zooka_runtime` does not exist.

## 4. How the migration was tested

Reasoning about SQL is not a test, so it runs against a real engine:

```
node scripts/audit/verify-0057.mjs
```

PGlite (in-process PostgreSQL) with a fixture that reproduces the three states
the migration must separate: a tenant table added after 0051, a platform table
without a tenant column, and a table that is already migrated under a policy of
its own. Sequence: up → up → down → up, asserting after each step, plus a real
`SET ROLE` isolation check (workspace A sees 1 of 2 rows).

Two real defects were found this way and fixed before the migration was
proposed:

1. `GRANT ... ON ALL SEQUENCES OWNED BY <table>` is not valid PostgreSQL; the
   owning table is now resolved through `pg_depend` and each sequence is granted
   individually.
2. the policy was first named `tenant_coverage`, and the down file dropped it by
   name, which would have deleted a policy the migration did not create. It is
   now `runtime_coverage_tenant`.

Final run: all 10 checks pass.

## 5. Risk assessment

| statement | risk | why it is safe |
|---|---|---|
| `GRANT SELECT/INSERT/UPDATE/DELETE` | low | additive; the runtime role is not connected in production, so nothing changes at request time. With RLS on and no tenant context it still reads 0 rows |
| `GRANT USAGE, SELECT` on sequences | low | sequence access alone gives no row access |
| `ENABLE ROW LEVEL SECURITY` | medium | a table with RLS and a tenant policy returns 0 rows to the owner role too *if the role has no BYPASSRLS*. The owner role keeps `BYPASSRLS`, so production behaviour does not change today; the effect appears only after the connection moves |
| `CREATE POLICY runtime_coverage_tenant` | low | new policy name, `DROP POLICY IF EXISTS` first, no existing policy is modified |
| NOTICE on ungated tables | none | reporting only |

The single real hazard is the ordering trap already proven in this project:
enabling RLS on a table before the application has a tenant context makes that
table return zero rows. That is why the connection move is a separate, later,
approved step and not part of this migration.

## 6. Rollback

`0057_runtime_coverage_gaps.down.sql` drops exactly the policies this migration
created (`runtime_coverage_tenant`) and disables RLS on those tables. It never
touches a policy it did not create, and never touches the grants, because they
are additive and revoking them during an unrelated rollback is its own outage.
The two statements to revoke them, if that is ever the decision:

```sql
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM zooka_runtime;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM zooka_runtime;
```

Then re-apply 0051 and 0056 to restore the intended grant set.

## 7. Cutover sequence (after this migration, separately approved)

1. take a backup through the admin route and record the row counts;
2. apply 0057 in a maintenance window and re-run the audit: section F must show
   `runtime_without_select = 0`;
3. verify the 278 users, 63 chats, 315 messages, 22 documents are unchanged;
4. point `DATABASE_URL` at `zooka_runtime` and keep `DATABASE_URL_SERVICE` for
   the bootstrap writes (membership, subscription, tokens);
5. run the acceptance journeys; on any failure, revert the one variable and
   re-run `0057...down.sql`.

Steps 4 and 5 are not covered by this change and are not authorised by it.

## 8. Current state

- production connection, credentials and variables: unchanged;
- migration 0057: present in the repo as `pending`, not applied;
- nothing merged, nothing deployed.
