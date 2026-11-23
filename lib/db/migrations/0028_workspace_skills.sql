CREATE TABLE IF NOT EXISTS "WorkspaceSkill" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organizationId" uuid NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "name" varchar(64) NOT NULL,
  "description" text NOT NULL,
  "instructions" text NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "createdBy" uuid REFERENCES "User"("id") ON DELETE SET NULL,
  "createdAt" timestamptz DEFAULT now() NOT NULL,
  "updatedAt" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "WorkspaceSkill_organizationId_name_key" UNIQUE ("organizationId", "name")
);
--> statement-breakpoint
ALTER TABLE "WorkspaceSkill" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'WorkspaceSkill' AND policyname = 'WorkspaceSkill_tenant_isolation')
    AND to_regprocedure('public.app_is_org_member(text)') IS NOT NULL THEN
    EXECUTE 'CREATE POLICY "WorkspaceSkill_tenant_isolation" ON "WorkspaceSkill" FOR ALL
      USING ("organizationId"::text = current_setting(''app.organization_id'', true) AND public.app_is_org_member(current_setting(''app.organization_id'', true)))
      WITH CHECK ("organizationId"::text = current_setting(''app.organization_id'', true) AND public.app_is_org_member(current_setting(''app.organization_id'', true)))';
  ELSIF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'WorkspaceSkill' AND policyname = 'WorkspaceSkill_tenant_isolation') THEN
    EXECUTE 'CREATE POLICY "WorkspaceSkill_tenant_isolation" ON "WorkspaceSkill" FOR ALL
      USING ("organizationId"::text = current_setting(''app.organization_id'', true))
      WITH CHECK ("organizationId"::text = current_setting(''app.organization_id'', true))';
  END IF;
  IF to_regrole('zooka_runtime') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "WorkspaceSkill" TO zooka_runtime;
  END IF;
END $$;
