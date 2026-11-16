# Migration safety

Measured 2026-11-16 on a disposable PostgreSQL 15.19 database built only from this repository's migrations.
No production database was contacted.

## What the set actually does

| Step | Result |
| --- | --- |
| Apply `0000`–`0027` (the pending set's starting point) | 33 tables |
| Apply the 18 pending pairs | 18/18, 46 tables |
| Roll back all 18 | 18/18, 34 tables |
| Reapply all 18 | 18/18, 46 tables |

The rollback returns to 34 rather than 33 because `integration_connection` is created inside `0035` and is not
dropped by any down file. The reason is visible in the statement itself: `0035` opens with
`CREATE TABLE IF NOT EXISTS integration_connection` and a comment saying the table already exists in production
and is only created here for a database that lacks it. So this migration *may or may not* have created the
table, and it cannot tell which. Dropping it on rollback would therefore destroy a table owned by the
integrations module (and its credentials) in exactly the database where it mattered most.

**The safe correction is therefore not to add the `DROP`.** The invariant is: a full rollback restores the
pre-migration table set minus nothing, plus `integration_connection` only when it did not exist before. On the
disposable rehearsal database it did not exist, hence 34. Any future migration that creates a shared table
defensively must state the same asymmetry rather than claim a byte-perfect inverse.

## The five tables the directive asked about

| Table | Created by | Ownership | Dependents | Should rollback drop it? | Data-loss impact |
| --- | --- | --- | --- | --- | --- |
| `EmailVerificationToken` | `0029` | rows carry `userId` → `User` | none referencing it | yes, but never while it holds rows | rows written since deploy would vanish silently before the guard |
| `AgentExecution` | `0034` (extended by `0035`) | `organizationId` → workspace | none (`ON DELETE` not declared) | yes, guarded | execution history would vanish |
| `SchedulerRun` | `0035` | none (run log) | none | yes, guarded | scheduler history would vanish |
| `AgentSchedule` | `0038` | `organizationId` → workspace | `AgentTask.scheduleId` | yes, guarded | schedules and the tasks pointing at them |
| `AgentLaunchPlan` | `0039` | `organizationId` → workspace | none | yes, guarded | generated plans would vanish |

None of the five exists in the 33-table baseline, so each is genuinely created by its own migration. An earlier
note in `STAGING_READINESS.md` claimed the opposite and is retracted there.

## The guard

Every down file that drops a table now begins with:

```sql
DO $$
DECLARE rows_present bigint;
BEGIN
  IF to_regclass('public."Table"') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM "Table"' INTO rows_present;
    IF rows_present > 0 THEN
      RAISE EXCEPTION 'forward_only: "Table" holds % row(s); rollback refused to discard them', rows_present
        USING HINT = 'Export the rows, delete them deliberately, or restore the pre-migration backup.';
    END IF;
  END IF;
END $$;
```

Executed proof, not inspection:

- One row present in `SchedulerRun` → `ERROR: forward_only: "SchedulerRun" holds 1 row(s); rollback refused to discard them`, table and row both still present afterwards.
- Row deleted, table empty → drop proceeded, table gone.
- All 18 downs on an empty schema → 18/18, no guard fired.
- All 18 ups again → 18/18, 46 tables.

## Writing the guard found a bug in the guard

The first version read `to_regclass('public."SchedulerRun")`, with the closing quote missing. PostgreSQL answered
`mismatched parentheses`, which is exactly the failure a "zero exit code" report would have called success. The
lesson is recorded because it is the directive's own point: SQL that returns without error is not SQL that did
what was intended.

## Recovery, if a rollback is refused

1. Export the rows named in the error (for `AgentSchedule`, include the tasks pointing at it).
2. Confirm the export parses and its row count matches the error's count.
3. Delete the rows deliberately, then re-run the same down file.
4. If the rows cannot be deleted, do not roll back. Restore the pre-migration backup into a fresh database and
   point the application at it, which keeps both the data and the old schema without a destructive step.

A refused rollback is a safe state, not a broken one: the schema and the data are both intact.
