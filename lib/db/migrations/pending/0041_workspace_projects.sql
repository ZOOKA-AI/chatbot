-- Workspace projects, and the links that let work roll up to one.
--
-- Additive only: a new table plus nullable columns on three existing tables. Nothing that
-- exists today changes behaviour, and every link is optional, so a workspace that never
-- creates a project keeps working exactly as it does now.
--
-- Named AgentProject on purpose. "Project" already exists and means a hosted website
-- (subdomain, custom domain, template); a workspace project groups agents, tasks, schedules
-- and their evidence, and points at the hosted site through siteProjectId when it makes one.

CREATE TABLE IF NOT EXISTS "AgentProject" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" varchar(64) NOT NULL,
  "name" varchar(200) NOT NULL,
  "summary" text,
  "status" varchar(24) NOT NULL DEFAULT 'active',
  "brief" jsonb,
  -- The foreign key is added below, and only when the hosted-site table exists. A workspace
  -- project may point at the site it produced, but this table must not depend on that table
  -- being present: some deployments build their schema from the agent migrations alone.
  "siteProjectId" uuid,
  "createdBy" varchar(64) NOT NULL DEFAULT 'owner',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "AgentProject_organizationId_name_key"
  ON "AgentProject" ("organizationId", "name");
CREATE INDEX IF NOT EXISTS "AgentProject_organizationId_idx"
  ON "AgentProject" ("organizationId");
CREATE INDEX IF NOT EXISTS "AgentProject_siteProjectId_idx"
  ON "AgentProject" ("siteProjectId");

-- Link to the hosted-site record when that table exists in this database.
DO $$
BEGIN
  IF to_regclass('public."Project"') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint WHERE conname = 'AgentProject_siteProjectId_fkey'
     )
  THEN
    ALTER TABLE "AgentProject"
      ADD CONSTRAINT "AgentProject_siteProjectId_fkey"
      FOREIGN KEY ("siteProjectId") REFERENCES "Project" ("id") ON DELETE SET NULL;
  END IF;
END $$;
--> statement-breakpoint

-- The links. Each is nullable with ON DELETE SET NULL: removing a project must never delete
-- an agent, a schedule or the execution record of work that really happened.
ALTER TABLE "AgentIdentity" ADD COLUMN IF NOT EXISTS "projectId" uuid
  REFERENCES "AgentProject" ("id") ON DELETE SET NULL;
ALTER TABLE "AgentSchedule" ADD COLUMN IF NOT EXISTS "projectId" uuid
  REFERENCES "AgentProject" ("id") ON DELETE SET NULL;
ALTER TABLE "AgentTask" ADD COLUMN IF NOT EXISTS "projectId" uuid
  REFERENCES "AgentProject" ("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "AgentIdentity_projectId_idx" ON "AgentIdentity" ("projectId");
CREATE INDEX IF NOT EXISTS "AgentSchedule_projectId_idx" ON "AgentSchedule" ("projectId");
CREATE INDEX IF NOT EXISTS "AgentTask_projectId_idx" ON "AgentTask" ("projectId");

-- Same tenant policy shape as 0030 and 0039.
ALTER TABLE "AgentProject" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "AgentProject_tenant_isolation" ON "AgentProject";
CREATE POLICY "AgentProject_tenant_isolation" ON "AgentProject"
  FOR ALL
  USING (("organizationId")::text = current_setting('app.organization_id', true))
  WITH CHECK (("organizationId")::text = current_setting('app.organization_id', true));

-- The runtime role needs privileges on the new table for the same reason it has them on the
-- Commander tables: RLS filters rows, but privileges are what allow the role to reach the table
-- at all. Without this, tenant scope would fail with a permission error instead of filtering.
-- The grant is skipped when the runtime role has not been created in this database, which is the
-- case for a schema built from a partial migration chain. A missing role is reported, not
-- silently ignored, so an operator can see why the table is unreachable for that role.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zooka_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "AgentProject" TO zooka_runtime;
  ELSE
    RAISE NOTICE 'zooka_runtime role absent: AgentProject grant skipped';
  END IF;
END $$;

-- Self-verification: fails loudly rather than reporting success for a partial apply.
DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(name, ',') INTO missing
  FROM (VALUES ('AgentProject'), ('AgentIdentity'), ('AgentSchedule'), ('AgentTask')) AS t(name)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = t.name
  );
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'missing tables after 0041: %', missing;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'AgentTask' AND column_name = 'projectId'
  ) THEN
    RAISE EXCEPTION 'AgentTask.projectId was not added';
  END IF;
END $$;
