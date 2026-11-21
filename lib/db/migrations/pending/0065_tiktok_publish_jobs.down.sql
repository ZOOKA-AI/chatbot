-- Forward-only guard.
--
-- Dropping the queue table is the correct inverse of creating it. Dropping it
-- while it holds rows is data loss with a zero exit code, so the rollback
-- refuses and says what to do instead. A queued row is somebody's scheduled
-- post, not scratch data.
DO $$
DECLARE rows_present bigint;
BEGIN
  IF to_regclass('public."TikTokPublishJob"') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM "TikTokPublishJob"' INTO rows_present;
    IF rows_present > 0 THEN
      RAISE EXCEPTION 'forward_only: "TikTokPublishJob" holds % row(s); rollback refused to discard them', rows_present
        USING HINT = 'Export the rows, delete them deliberately, or restore the pre-migration backup. See docs/tiktok-publishing-release-065.md.';
    END IF;
  END IF;
END $$;

-- Forward-only guard.
--
-- The audit trail is the only record of what happened to a job. Losing it while
-- rows exist would erase the answer to "did this publish", so it is guarded too.
DO $$
DECLARE rows_present bigint;
BEGIN
  IF to_regclass('public."TikTokPublishEvent"') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM "TikTokPublishEvent"' INTO rows_present;
    IF rows_present > 0 THEN
      RAISE EXCEPTION 'forward_only: "TikTokPublishEvent" holds % row(s); rollback refused to discard them', rows_present
        USING HINT = 'Export the rows or delete them deliberately. See docs/tiktok-publishing-release-065.md.';
    END IF;
  END IF;
END $$;

DROP TABLE IF EXISTS "TikTokPublishEvent";

DROP TABLE IF EXISTS "TikTokPublishJob";
