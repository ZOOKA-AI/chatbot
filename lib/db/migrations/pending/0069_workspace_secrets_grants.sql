-- Repair grants if runtime-role hardening ran after migration 0029.
DO $$
BEGIN
  IF to_regrole('zooka_runtime') IS NOT NULL AND to_regclass('public."WorkspaceSecret"') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "WorkspaceSecret" TO zooka_runtime;
  END IF;
  IF to_regrole('zooka_runtime') IS NOT NULL AND to_regclass('public."WorkspaceSecretSettings"') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "WorkspaceSecretSettings" TO zooka_runtime;
  END IF;
END $$;
