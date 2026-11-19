DROP INDEX IF EXISTS "AgentExecution_org_status_idx";
DROP INDEX IF EXISTS "AgentExecution_idempotencyKey_key";
ALTER TABLE "AgentExecution" DROP COLUMN IF EXISTS "recoveredFrom";
ALTER TABLE "AgentExecution" DROP COLUMN IF EXISTS "idempotencyKey";
ALTER TABLE "AgentExecution" DROP COLUMN IF EXISTS "heartbeatAt";
ALTER TABLE "AgentExecution" DROP COLUMN IF EXISTS "leaseExpiresAt";
-- Forward-only guard.
--
-- This migration created the table below, so dropping it is the correct inverse. What is not correct is
-- dropping it while it holds rows: every row written since the deploy would disappear with nothing said.
-- Data loss must be a decision, not a side effect of a zero exit code.
DO $$
DECLARE rows_present bigint;
BEGIN
  IF to_regclass('public."SchedulerRun"') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM "SchedulerRun"' INTO rows_present;
    IF rows_present > 0 THEN
      RAISE EXCEPTION 'forward_only: "SchedulerRun" holds % row(s); rollback refused to discard them', rows_present
        USING HINT = 'Export the rows, delete them deliberately, or restore the pre-migration backup. See docs/release/ROLLBACK_PLAN.md.';
    END IF;
  END IF;
END $$;

DROP TABLE IF EXISTS "SchedulerRun";
-- integration_connection is left alone: it belongs to the integrations module.
