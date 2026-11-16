-- Rollback for 0041. Drops the links first, then the table, so no foreign key is left dangling.
ALTER TABLE "AgentTask" DROP COLUMN IF EXISTS "projectId";
ALTER TABLE "AgentSchedule" DROP COLUMN IF EXISTS "projectId";
ALTER TABLE "AgentIdentity" DROP COLUMN IF EXISTS "projectId";
-- Forward-only guard.
--
-- Dropping a table this migration created is the correct inverse. Dropping it while it holds rows is data
-- loss with a zero exit code, so the rollback refuses and says what to do instead.
DO $$
DECLARE rows_present bigint;
BEGIN
  IF to_regclass('public."AgentProject"') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM "AgentProject"' INTO rows_present;
    IF rows_present > 0 THEN
      RAISE EXCEPTION 'forward_only: "AgentProject" holds % row(s); rollback refused to discard them', rows_present
        USING HINT = 'Export the rows, delete them deliberately, or restore the pre-migration backup. See docs/release/ROLLBACK_PLAN.md.';
    END IF;
  END IF;
END $$;

DROP TABLE IF EXISTS "AgentProject";
