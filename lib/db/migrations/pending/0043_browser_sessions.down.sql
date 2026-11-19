-- Rollback for 0043. Evidence and events cascade with their session, so dropping the session table
-- removes the whole record of the browser having run. Screenshot files on disk are not removed by
-- the database and must be cleared separately.
-- Forward-only guard.
--
-- Dropping a table this migration created is the correct inverse. Dropping it while it holds rows is data
-- loss with a zero exit code, so the rollback refuses and says what to do instead.
DO $$
DECLARE rows_present bigint;
BEGIN
  IF to_regclass('public."BrowserEvidence"') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM "BrowserEvidence"' INTO rows_present;
    IF rows_present > 0 THEN
      RAISE EXCEPTION 'forward_only: "BrowserEvidence" holds % row(s); rollback refused to discard them', rows_present
        USING HINT = 'Export the rows, delete them deliberately, or restore the pre-migration backup. See docs/release/ROLLBACK_PLAN.md.';
    END IF;
  END IF;
END $$;

-- Forward-only guard.
--
-- Dropping a table this migration created is the correct inverse. Dropping it while it holds rows is data
-- loss with a zero exit code, so the rollback refuses and says what to do instead.
DO $$
DECLARE rows_present bigint;
BEGIN
  IF to_regclass('public."BrowserEvent"') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM "BrowserEvent"' INTO rows_present;
    IF rows_present > 0 THEN
      RAISE EXCEPTION 'forward_only: "BrowserEvent" holds % row(s); rollback refused to discard them', rows_present
        USING HINT = 'Export the rows, delete them deliberately, or restore the pre-migration backup. See docs/release/ROLLBACK_PLAN.md.';
    END IF;
  END IF;
END $$;

DROP TABLE IF EXISTS "BrowserEvidence";
DROP TABLE IF EXISTS "BrowserEvent";
-- Forward-only guard.
--
-- Dropping a table this migration created is the correct inverse. Dropping it while it holds rows is data
-- loss with a zero exit code, so the rollback refuses and says what to do instead.
DO $$
DECLARE rows_present bigint;
BEGIN
  IF to_regclass('public."BrowserSession"') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM "BrowserSession"' INTO rows_present;
    IF rows_present > 0 THEN
      RAISE EXCEPTION 'forward_only: "BrowserSession" holds % row(s); rollback refused to discard them', rows_present
        USING HINT = 'Export the rows, delete them deliberately, or restore the pre-migration backup. See docs/release/ROLLBACK_PLAN.md.';
    END IF;
  END IF;
END $$;

DROP TABLE IF EXISTS "BrowserSession";
