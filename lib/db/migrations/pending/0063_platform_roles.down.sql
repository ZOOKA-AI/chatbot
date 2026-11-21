-- Reverts 0063. Refuses while grants or audit rows exist: dropping them silently would
-- erase who holds platform access and the record of every change to it.
DO $$
DECLARE rows_present bigint;
BEGIN
  IF to_regclass('public."PlatformAuditLog"') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM "PlatformAuditLog"' INTO rows_present;
    IF rows_present > 0 THEN
      RAISE EXCEPTION 'forward_only: "PlatformAuditLog" holds % row(s); rollback refused to discard them', rows_present
        USING HINT = 'Export the rows, delete them deliberately, or restore the pre-migration backup. See docs/release/ROLLBACK_PLAN.md.';
    END IF;
  END IF;
END $$;

DROP TABLE IF EXISTS "PlatformAuditLog";

DO $$
DECLARE rows_present bigint;
BEGIN
  IF to_regclass('public."PlatformRole"') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM "PlatformRole"' INTO rows_present;
    IF rows_present > 0 THEN
      RAISE EXCEPTION 'forward_only: "PlatformRole" holds % row(s); rollback refused to discard them', rows_present
        USING HINT = 'Export the rows, delete them deliberately, or restore the pre-migration backup. See docs/release/ROLLBACK_PLAN.md.';
    END IF;
  END IF;
END $$;

DROP TABLE IF EXISTS "PlatformRole";
