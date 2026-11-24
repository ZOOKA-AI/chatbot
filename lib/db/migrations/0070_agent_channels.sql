CREATE TABLE IF NOT EXISTS "AgentChannel" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organizationId" uuid NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "provider" varchar(16) NOT NULL,
  "externalId" varchar(64) NOT NULL,
  "displayName" varchar(120),
  "secretName" varchar(64) NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "messageCount" integer DEFAULT 0 NOT NULL,
  "lastSeenAt" timestamptz,
  "createdBy" uuid REFERENCES "User"("id") ON DELETE SET NULL,
  "createdAt" timestamptz DEFAULT now() NOT NULL,
  "updatedAt" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "AgentChannel_organizationId_provider_externalId_key" UNIQUE ("organizationId", "provider", "externalId")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "AgentChannel_provider_externalId_idx" ON "AgentChannel" ("provider", "externalId");
--> statement-breakpoint
ALTER TABLE "AgentChannel" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'AgentChannel' AND policyname = 'AgentChannel_tenant_isolation')
    AND to_regprocedure('public.app_is_org_member(text)') IS NOT NULL THEN
    EXECUTE 'CREATE POLICY "AgentChannel_tenant_isolation" ON "AgentChannel" FOR ALL
      USING ("organizationId"::text = current_setting(''app.organization_id'', true) AND public.app_is_org_member(current_setting(''app.organization_id'', true)))
      WITH CHECK ("organizationId"::text = current_setting(''app.organization_id'', true) AND public.app_is_org_member(current_setting(''app.organization_id'', true)))';
  ELSIF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'AgentChannel' AND policyname = 'AgentChannel_tenant_isolation') THEN
    EXECUTE 'CREATE POLICY "AgentChannel_tenant_isolation" ON "AgentChannel" FOR ALL
      USING ("organizationId"::text = current_setting(''app.organization_id'', true))
      WITH CHECK ("organizationId"::text = current_setting(''app.organization_id'', true))';
  END IF;
  IF to_regrole('zooka_runtime') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "AgentChannel" TO zooka_runtime;
  END IF;
END $$;
