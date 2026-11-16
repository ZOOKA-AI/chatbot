-- A launch plan a customer can open again.
--
-- Backward compatible: this adds a table and changes nothing that exists. Every plan is
-- scoped by "organizationId" and carries the brief and the plan as they were built, so
-- re-reading a plan shows what was presented rather than a fresh generation.

CREATE TABLE IF NOT EXISTS "AgentLaunchPlan" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" varchar(64) NOT NULL,
  "title" varchar(200) NOT NULL,
  "brief" jsonb NOT NULL,
  "plan" jsonb NOT NULL,
  "steps" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdBy" varchar(64) NOT NULL DEFAULT 'owner',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "AgentLaunchPlan_org_created_idx"
  ON "AgentLaunchPlan" ("organizationId", "createdAt");

-- Same tenant policy shape as 0030. The GUC is set per request inside a transaction by
-- lib/db/tenant.ts; without it a row matches nothing, which is the closed failure.
ALTER TABLE "AgentLaunchPlan" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "AgentLaunchPlan_tenant_isolation" ON "AgentLaunchPlan";
CREATE POLICY "AgentLaunchPlan_tenant_isolation" ON "AgentLaunchPlan"
  FOR ALL
  USING ("organizationId" = current_setting('app.organization_id', true))
  WITH CHECK ("organizationId" = current_setting('app.organization_id', true));
