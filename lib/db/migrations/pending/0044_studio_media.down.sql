DROP POLICY IF EXISTS "StudioAsset_tenant_read" ON "StudioAsset";
-- Forward-only guard.
--
-- Dropping a table this migration created is the correct inverse. Dropping it while it holds rows is data
-- loss with a zero exit code, so the rollback refuses and says what to do instead.
DO $$
DECLARE rows_present bigint;
BEGIN
  IF to_regclass('public."StudioAsset"') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM "StudioAsset"' INTO rows_present;
    IF rows_present > 0 THEN
      RAISE EXCEPTION 'forward_only: "StudioAsset" holds % row(s); rollback refused to discard them', rows_present
        USING HINT = 'Export the rows, delete them deliberately, or restore the pre-migration backup. See docs/release/ROLLBACK_PLAN.md.';
    END IF;
  END IF;
END $$;

DROP TABLE IF EXISTS "StudioAsset";
