-- Earlier runtime-role migrations revoke grants on all existing tables.
DO $$
BEGIN
  IF to_regrole('zooka_runtime') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "WorkspaceSkill" TO zooka_runtime;
  END IF;
END $$;
