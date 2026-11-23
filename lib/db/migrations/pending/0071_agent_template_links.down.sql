DO $$
DECLARE rows_present bigint;
BEGIN
  IF to_regclass('public."AgentTemplateLink"') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM "AgentTemplateLink"' INTO rows_present;
    IF rows_present > 0 THEN
      RAISE EXCEPTION 'forward_only: "AgentTemplateLink" holds % row(s); rollback refused to discard them', rows_present;
    END IF;
  END IF;
END $$;

DROP TABLE IF EXISTS "AgentTemplateLink";
