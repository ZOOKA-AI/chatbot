-- Reverse of 0038. Drops only what this migration added, and only if the columns exist.
DROP INDEX IF EXISTS "AgentTask_schedule_slot_key";
ALTER TABLE "AgentTask" DROP COLUMN IF EXISTS "scheduledFor";
ALTER TABLE "AgentTask" DROP COLUMN IF EXISTS "scheduleId";
ALTER TABLE "AgentTask" DROP COLUMN IF EXISTS "payload";
ALTER TABLE "AgentIdentity" DROP COLUMN IF EXISTS "modelProvider";
ALTER TABLE "AgentIdentity" DROP COLUMN IF EXISTS "modelId";
-- Forward-only guard.
--
-- This migration created the table below, so dropping it is the correct inverse. What is not correct is
-- dropping it while it holds rows: every row written since the deploy would disappear with nothing said.
-- Data loss must be a decision, not a side effect of a zero exit code.
DO $$
DECLARE rows_present bigint;
BEGIN
  IF to_regclass('public."AgentSchedule"') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM "AgentSchedule"' INTO rows_present;
    IF rows_present > 0 THEN
      RAISE EXCEPTION 'forward_only: "AgentSchedule" holds % row(s); rollback refused to discard them', rows_present
        USING HINT = 'Export the rows, delete them deliberately, or restore the pre-migration backup. See docs/release/ROLLBACK_PLAN.md.';
    END IF;
  END IF;
END $$;

DROP TABLE IF EXISTS "AgentSchedule";
