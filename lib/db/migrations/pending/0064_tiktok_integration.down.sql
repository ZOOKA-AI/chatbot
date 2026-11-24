DROP POLICY IF EXISTS "TikTokUpload_tenant" ON "TikTokUpload";
-- Forward-only guard.
--
-- Dropping a table this migration created is the correct inverse. Dropping it
-- while it holds rows is data loss with a zero exit code, so the rollback
-- refuses and says what to do instead. TikTokUpload rows are the record of what
-- was uploaded to a creator's inbox, so they are evidence, not scratch data.
DO $$
DECLARE rows_present bigint;
BEGIN
  IF to_regclass('public."TikTokUpload"') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM "TikTokUpload"' INTO rows_present;
    IF rows_present > 0 THEN
      RAISE EXCEPTION 'forward_only: "TikTokUpload" holds % row(s); rollback refused to discard them', rows_present
        USING HINT = 'Export the rows, delete them deliberately, or restore the pre-migration backup. See docs/release/ROLLBACK_PLAN.md.';
    END IF;
  END IF;
END $$;

DROP TABLE IF EXISTS "TikTokUpload";

DROP POLICY IF EXISTS "TikTokConnection_tenant" ON "TikTokConnection";
-- Forward-only guard. A connection row holds encrypted tokens: discarding it
-- silently would disconnect a creator without telling anyone.
DO $$
DECLARE rows_present bigint;
BEGIN
  IF to_regclass('public."TikTokConnection"') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM "TikTokConnection"' INTO rows_present;
    IF rows_present > 0 THEN
      RAISE EXCEPTION 'forward_only: "TikTokConnection" holds % row(s); rollback refused to discard them', rows_present
        USING HINT = 'Export the rows, delete them deliberately, or restore the pre-migration backup. See docs/release/ROLLBACK_PLAN.md.';
    END IF;
  END IF;
END $$;

DROP TABLE IF EXISTS "TikTokConnection";
