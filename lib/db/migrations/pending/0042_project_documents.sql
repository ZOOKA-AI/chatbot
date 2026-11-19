-- Customer-visible documents produced by an agent, scoped to one workspace and one project.
--
-- A document is evidence of work: it records which task and which agent produced it, so a
-- customer can trace an artifact back to the run that made it. Bodies are stored inline because
-- they are small structured texts, not binaries.

CREATE TABLE IF NOT EXISTS "ProjectDocument" (
  "id" uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" varchar(64) NOT NULL,
  "projectId" uuid NOT NULL REFERENCES "AgentProject"("id") ON DELETE CASCADE,
  "taskId" uuid REFERENCES "AgentTask"("id") ON DELETE SET NULL,
  "title" varchar(200) NOT NULL,
  "format" varchar(16) NOT NULL DEFAULT 'markdown',
  "body" text NOT NULL,
  "bytes" integer NOT NULL DEFAULT 0,
  "createdBy" varchar(64) NOT NULL DEFAULT 'owner',
  "createdAt" timestamp with time zone NOT NULL DEFAULT now()
);

-- Tenant coupling at the database level, not only in the code that writes.
--
-- Without this, a row could name workspace A while pointing at workspace B's project, and every
-- query filtering by organizationId would still return it: the document would leak across the
-- boundary while looking correctly scoped. The pair (id, organizationId) on AgentProject is what
-- makes a composite foreign key possible.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AgentProject_id_organizationId_key'
  ) THEN
    ALTER TABLE "AgentProject"
      ADD CONSTRAINT "AgentProject_id_organizationId_key" UNIQUE ("id", "organizationId");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ProjectDocument_org_project_created_idx"
  ON "ProjectDocument" ("organizationId", "projectId", "createdAt" DESC);

-- A document can name the task that made it only once.
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectDocument_taskId_key"
  ON "ProjectDocument" ("taskId")
  WHERE "taskId" IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProjectDocument_project_tenant_fkey'
  ) THEN
    ALTER TABLE "ProjectDocument"
      ADD CONSTRAINT "ProjectDocument_project_tenant_fkey"
      FOREIGN KEY ("projectId", "organizationId")
      REFERENCES "AgentProject" ("id", "organizationId")
      ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE "ProjectDocument" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ProjectDocument_tenant_isolation" ON "ProjectDocument";
CREATE POLICY "ProjectDocument_tenant_isolation" ON "ProjectDocument"
  USING (("organizationId")::text = current_setting('app.organization_id', true))
  WITH CHECK (("organizationId")::text = current_setting('app.organization_id', true));

-- Same grant posture as 0041: privileges reach the table, RLS decides the rows. Skipped when the
-- runtime role does not exist in this database (a schema built from a partial chain).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zooka_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "ProjectDocument" TO zooka_runtime;
  ELSE
    RAISE NOTICE 'zooka_runtime role absent: ProjectDocument grant skipped';
  END IF;
END $$;

-- Self-verification: a partial apply must fail loudly, not report success.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ProjectDocument'
  ) THEN
    RAISE EXCEPTION 'ProjectDocument was not created';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'ProjectDocument_org_project_created_idx'
  ) THEN
    RAISE EXCEPTION 'ProjectDocument index was not created';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ProjectDocument'
  ) THEN
    RAISE EXCEPTION 'ProjectDocument has no tenant policy';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ProjectDocument_projectId_fkey'
  ) THEN
    RAISE EXCEPTION 'ProjectDocument is not related to AgentProject';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ProjectDocument_project_tenant_fkey'
  ) THEN
    RAISE EXCEPTION 'ProjectDocument is not tenant-coupled to its project';
  END IF;
END $$;
