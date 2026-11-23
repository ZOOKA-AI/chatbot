CREATE TABLE IF NOT EXISTS "WorkspaceSecret" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organizationId" uuid NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "name" varchar(64) NOT NULL,
  "encryptedValue" text NOT NULL,
  "createdBy" uuid REFERENCES "User"("id") ON DELETE SET NULL,
  "createdAt" timestamptz DEFAULT now() NOT NULL,
  "updatedAt" timestamptz DEFAULT now() NOT NULL,
  "lastUsedAt" timestamptz,
  CONSTRAINT "WorkspaceSecret_organizationId_name_key" UNIQUE ("organizationId", "name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "WorkspaceSecretSettings" (
  "organizationId" uuid PRIMARY KEY REFERENCES "Organization"("id") ON DELETE CASCADE,
  "detectionEnabled" boolean NOT NULL DEFAULT true
);
--> statement-breakpoint
ALTER TABLE "WorkspaceSecret" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "WorkspaceSecretSettings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'WorkspaceSecret' AND policyname = 'WorkspaceSecret_tenant_isolation')
    AND to_regprocedure('public.app_is_org_member(text)') IS NOT NULL THEN
    EXECUTE 'CREATE POLICY "WorkspaceSecret_tenant_isolation" ON "WorkspaceSecret" FOR ALL
      USING ("organizationId"::text = current_setting(''app.organization_id'', true) AND public.app_is_org_member(current_setting(''app.organization_id'', true)))
      WITH CHECK ("organizationId"::text = current_setting(''app.organization_id'', true) AND public.app_is_org_member(current_setting(''app.organization_id'', true)))';
  ELSIF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'WorkspaceSecret' AND policyname = 'WorkspaceSecret_tenant_isolation') THEN
    EXECUTE 'CREATE POLICY "WorkspaceSecret_tenant_isolation" ON "WorkspaceSecret" FOR ALL
      USING ("organizationId"::text = current_setting(''app.organization_id'', true))
      WITH CHECK ("organizationId"::text = current_setting(''app.organization_id'', true))';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'WorkspaceSecretSettings' AND policyname = 'WorkspaceSecretSettings_tenant_isolation')
    AND to_regprocedure('public.app_is_org_member(text)') IS NOT NULL THEN
    EXECUTE 'CREATE POLICY "WorkspaceSecretSettings_tenant_isolation" ON "WorkspaceSecretSettings" FOR ALL
      USING ("organizationId"::text = current_setting(''app.organization_id'', true) AND public.app_is_org_member(current_setting(''app.organization_id'', true)))
      WITH CHECK ("organizationId"::text = current_setting(''app.organization_id'', true) AND public.app_is_org_member(current_setting(''app.organization_id'', true)))';
  ELSIF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'WorkspaceSecretSettings' AND policyname = 'WorkspaceSecretSettings_tenant_isolation') THEN
    EXECUTE 'CREATE POLICY "WorkspaceSecretSettings_tenant_isolation" ON "WorkspaceSecretSettings" FOR ALL
      USING ("organizationId"::text = current_setting(''app.organization_id'', true))
      WITH CHECK ("organizationId"::text = current_setting(''app.organization_id'', true))';
  END IF;
  IF to_regrole('zooka_runtime') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "WorkspaceSecret" TO zooka_runtime;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "WorkspaceSecretSettings" TO zooka_runtime;
  END IF;
END $$;
