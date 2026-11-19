-- Rollback for 0042. Drops only what this migration created, in reverse order: the tenant-coupling
-- constraint and the unique key it depends on, then the table. The documents themselves live here,
-- so the drop removes them.
-- Forward-only guard.
--
-- Dropping a table this migration created is the correct inverse. Dropping it while it holds rows is data
-- loss with a zero exit code, so the rollback refuses and says what to do instead.
DO $$
DECLARE rows_present bigint;
BEGIN
  IF to_regclass('public."ProjectDocument"') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM "ProjectDocument"' INTO rows_present;
    IF rows_present > 0 THEN
      RAISE EXCEPTION 'forward_only: "ProjectDocument" holds % row(s); rollback refused to discard them', rows_present
        USING HINT = 'Export the rows, delete them deliberately, or restore the pre-migration backup. See docs/release/ROLLBACK_PLAN.md.';
    END IF;
  END IF;
END $$;

DROP TABLE IF EXISTS "ProjectDocument";
ALTER TABLE "AgentProject" DROP CONSTRAINT IF EXISTS "AgentProject_id_organizationId_key";
