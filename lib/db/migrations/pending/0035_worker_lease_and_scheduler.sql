-- Leases, scheduler observability, and the connection table the worker needs.
--
-- A worker that dies must not leave a task looking busy for ever, and two
-- schedulers must not run at once. Both are properties of the database here, not
-- of the process that happens to be running.

ALTER TABLE "AgentExecution" ADD COLUMN IF NOT EXISTS "leaseExpiresAt" timestamp;
ALTER TABLE "AgentExecution" ADD COLUMN IF NOT EXISTS "heartbeatAt" timestamp;
ALTER TABLE "AgentExecution" ADD COLUMN IF NOT EXISTS "idempotencyKey" varchar(128);
ALTER TABLE "AgentExecution" ADD COLUMN IF NOT EXISTS "recoveredFrom" uuid;

-- One attempt per (task, tool, attempt number). A retried request that arrives
-- twice cannot buy itself a second run by asking again.
CREATE UNIQUE INDEX IF NOT EXISTS "AgentExecution_idempotencyKey_key"
  ON "AgentExecution" ("idempotencyKey")
  WHERE "idempotencyKey" IS NOT NULL;

-- The scheduler asks this question often: who is running right now, per workspace.
CREATE INDEX IF NOT EXISTS "AgentExecution_org_status_idx"
  ON "AgentExecution" ("organizationId", status);

-- Every scheduler invocation is recorded, so "why did nothing run" has an answer.
CREATE TABLE IF NOT EXISTS "SchedulerRun" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "startedAt" timestamp NOT NULL DEFAULT now(),
  "finishedAt" timestamp,
  status varchar(24) NOT NULL DEFAULT 'running',
  "claimedCount" integer NOT NULL DEFAULT 0,
  "succeededCount" integer NOT NULL DEFAULT 0,
  "failedCount" integer NOT NULL DEFAULT 0,
  "skippedCount" integer NOT NULL DEFAULT 0,
  "reclaimedCount" integer NOT NULL DEFAULT 0,
  detail json,
  error text
);

CREATE INDEX IF NOT EXISTS "SchedulerRun_startedAt_idx" ON "SchedulerRun" ("startedAt");

-- The worker resolves a workspace's own credential. In this development database
-- the table does not exist; in production it already does, so this is a no-op
-- there and the existing columns and data are left untouched.
CREATE TABLE IF NOT EXISTS integration_connection (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id varchar(64) NOT NULL,
  provider varchar(64) NOT NULL,
  provider_id varchar(64),
  display_name varchar(200),
  account_email varchar(320),
  scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  encrypted_tokens text NOT NULL,
  expires_at timestamp,
  status varchar(24) NOT NULL DEFAULT 'connected',
  connected_by varchar(64),
  revoked_at timestamp,
  last_error text,
  last_used_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS integration_connection_workspace_provider_key
  ON integration_connection (workspace_id, provider);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zooka_runtime') THEN
    GRANT SELECT, INSERT, UPDATE ON "SchedulerRun" TO zooka_runtime;
    -- Read-only: the worker looks a workspace's credential up, it never stores one.
    GRANT SELECT ON integration_connection TO zooka_runtime;
  END IF;
END $$;
