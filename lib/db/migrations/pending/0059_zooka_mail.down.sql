-- 0059_zooka_mail (down)
--
-- Forward-only guards, one per table, for the same reason as 0034: a rollback
-- that drops a table holding rows is data loss with a zero exit code, and mail
-- rows are the only copy of a customer's messages. Dropping them has to be a
-- decision somebody made, not a side effect.
--
-- Order is reverse dependency: children before parents.

DO $$
DECLARE rows_present bigint;
BEGIN
  IF to_regclass('public."MailAudit"') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM "MailAudit"' INTO rows_present;
    IF rows_present > 0 THEN
      RAISE EXCEPTION 'forward_only: "MailAudit" holds % row(s); rollback refused to discard them', rows_present
        USING HINT = 'Export the audit rows, delete them deliberately, or restore the pre-migration backup.';
    END IF;
  END IF;
END $$;
DROP TABLE IF EXISTS "MailAudit";

DO $$
DECLARE rows_present bigint;
BEGIN
  IF to_regclass('public."MailAttachment"') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM "MailAttachment"' INTO rows_present;
    IF rows_present > 0 THEN
      RAISE EXCEPTION 'forward_only: "MailAttachment" holds % row(s); rollback refused to discard them', rows_present
        USING HINT = 'Export the attachment rows, delete them deliberately, or restore the pre-migration backup.';
    END IF;
  END IF;
END $$;
DROP TABLE IF EXISTS "MailAttachment";

DO $$
DECLARE rows_present bigint;
BEGIN
  IF to_regclass('public."MailDraft"') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM "MailDraft"' INTO rows_present;
    IF rows_present > 0 THEN
      RAISE EXCEPTION 'forward_only: "MailDraft" holds % row(s); rollback refused to discard them', rows_present
        USING HINT = 'Export the drafts, delete them deliberately, or restore the pre-migration backup.';
    END IF;
  END IF;
END $$;
DROP TABLE IF EXISTS "MailDraft";

DO $$
DECLARE rows_present bigint;
BEGIN
  IF to_regclass('public."MailMessage"') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM "MailMessage"' INTO rows_present;
    IF rows_present > 0 THEN
      RAISE EXCEPTION 'forward_only: "MailMessage" holds % row(s); rollback refused to discard them', rows_present
        USING HINT = 'Export the messages, delete them deliberately, or restore the pre-migration backup.';
    END IF;
  END IF;
END $$;
DROP TABLE IF EXISTS "MailMessage";

DO $$
DECLARE rows_present bigint;
BEGIN
  IF to_regclass('public."MailAddress"') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM "MailAddress"' INTO rows_present;
    IF rows_present > 0 THEN
      RAISE EXCEPTION 'forward_only: "MailAddress" holds % row(s); rollback refused to discard them', rows_present
        USING HINT = 'Export the reserved addresses, delete them deliberately, or restore the pre-migration backup.';
    END IF;
  END IF;
END $$;
DROP TABLE IF EXISTS "MailAddress";
