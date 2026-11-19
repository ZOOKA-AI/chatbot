# Rollback plan

Applies to the 18 pending migrations (`0028`–`0045`) and to the application code on `feat/commander-tenant-scope`.
Nothing in this plan has been executed against Preview or Production.

## Order of operations, forward

1. Take a full logical backup before touching the target. The read-only backup route returns password hashes
   and emails, so the dump goes to private storage and is never pasted into a ticket or a chat.
2. Apply in ascending order. Each file is idempotent; a partial run is corrected by re-running the same file,
   never by skipping ahead.
3. After the up pass, verify: table count, the seeded row survives, RLS enabled count, foreign-key count, and
   that the spend-approval constraint rejects a consumed row with no approving actor.
4. Only then deploy the application code that reads the new columns.

## Order of operations, back

Reverse order, newest file first (`0045` down to `0028`). Each down file was rehearsed on a disposable clone.

Measured result of the full reversal: 46 tables return to 34, the seeded `Organization` row survives, and the
runtime role holds zero table grants afterwards.

## Known rollback consequences

- Five tables are dropped and their rows are lost: `EmailVerificationToken` (0029), `AgentExecution` (0034),
  `SchedulerRun` (0035), `AgentSchedule` (0038), `AgentLaunchPlan` (0039). If any of them holds real data at
  rollback time, export it first.
- `zooka_runtime` is a cluster-wide role. If other databases reference it, `DROP ROLE` will refuse; the down
  file names those databases and reports a notice instead of aborting a rollback that is otherwise complete in
  this database.
- Rolling back `0030` does not re-open access: it removes policies, leaving the tables with RLS enabled and no
  policy, which denies by default for a non-owner role.

## Verification after any rollback

Run the same four checks as the forward pass, plus one query that proves the request role cannot read a
Commander table:

```sql
SELECT count(*) FROM information_schema.role_table_grants
 WHERE grantee = 'zooka_runtime' AND table_schema = 'public';
```

It must return zero.

## Application rollback

The code path is additive: every new column is nullable or defaulted, and the paid gate refuses by default, so
rolling the application back one commit restores the previous behaviour without a schema change. The exception
is a job that is mid-flight when the rollback happens; its approval row stays `uncertain` and must be settled by
reading the provider's job status, never by submitting again.
