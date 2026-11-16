-- Every attempt to execute a task, recorded once.
--
-- The task row says what the work is and how it ended. This table says who tried,
-- with which tool, when it started, when it stopped and what came back. Without
-- it "the agent completed the task" is an assertion; with it, it is a record.
CREATE TABLE IF NOT EXISTS "AgentExecution" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "taskId" uuid NOT NULL REFERENCES "AgentTask"(id) ON DELETE CASCADE,
  "organizationId" varchar(64) NOT NULL DEFAULT 'unclaimed',
  "agentId" uuid REFERENCES "AgentIdentity"(id) ON DELETE SET NULL,
  tool varchar(64) NOT NULL,
  attempt integer NOT NULL DEFAULT 1,
  status varchar(24) NOT NULL DEFAULT 'running',
  "startedAt" timestamp NOT NULL DEFAULT now(),
  "finishedAt" timestamp,
  "durationMs" integer,
  "resultSummary" text,
  "evidenceRef" varchar(512),
  error text,
  CONSTRAINT "AgentExecution_status_check"
    CHECK (status IN ('running','succeeded','failed','timed_out','cancelled','rejected'))
);

CREATE INDEX IF NOT EXISTS "AgentExecution_taskId_idx" ON "AgentExecution" ("taskId");
CREATE INDEX IF NOT EXISTS "AgentExecution_organizationId_idx" ON "AgentExecution" ("organizationId");

-- One in-flight execution per task. Two workers racing to run the same task both
-- insert; the database refuses the second, so duplicate execution is impossible
-- even if every check in the application were bypassed.
CREATE UNIQUE INDEX IF NOT EXISTS "AgentExecution_one_running_per_task"
  ON "AgentExecution" ("taskId")
  WHERE status = 'running';

-- Isolation and least privilege, matching the other Commander tables.
ALTER TABLE "AgentExecution" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "AgentExecution_tenant_isolation" ON "AgentExecution";
CREATE POLICY "AgentExecution_tenant_isolation" ON "AgentExecution"
  FOR ALL
  USING ("organizationId" = current_setting('app.organization_id', true))
  WITH CHECK ("organizationId" = current_setting('app.organization_id', true));

-- The runtime role may open and close an attempt, and may never delete one:
-- an execution record that can be erased is not an audit trail.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zooka_runtime') THEN
    GRANT SELECT, INSERT, UPDATE ON "AgentExecution" TO zooka_runtime;
    REVOKE DELETE ON "AgentExecution" FROM zooka_runtime;
  END IF;
END $$;

REVOKE ALL ON "AgentExecution" FROM PUBLIC;
