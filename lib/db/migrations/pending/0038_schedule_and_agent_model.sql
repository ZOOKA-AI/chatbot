-- 0038: recurring schedules, and a model choice that belongs to the agent.
--
-- Backward compatible: every column added to an existing table is nullable, so code that
-- predates this migration keeps working and no row is rewritten. The new table is the only
-- structural addition.
--
-- The unique index on ("scheduleId", "scheduledFor") is the duplicate prevention. Two
-- schedulers waking at the same instant both try to materialise the same slot, and the
-- database decides: one INSERT wins, the other is ON CONFLICT DO NOTHING. No application
-- lock is involved, because an application lock is a fact about one process.

CREATE TABLE IF NOT EXISTS "AgentSchedule" (
  "id" uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" varchar(64) NOT NULL,
  "agentId" uuid,
  "title" varchar(200) NOT NULL,
  "instruction" text NOT NULL,
  "tool" varchar(64) NOT NULL DEFAULT 'github_repo_inspect',
  "cronExpression" varchar(64) NOT NULL,
  "timezone" varchar(64) NOT NULL DEFAULT 'Asia/Dubai',
  "enabled" boolean NOT NULL DEFAULT true,
  "missedRunPolicy" varchar(16) NOT NULL DEFAULT 'skip',
  "nextRunAt" timestamp with time zone,
  "lastRunAt" timestamp with time zone,
  "createdBy" varchar(64) NOT NULL DEFAULT 'owner',
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "AgentSchedule_org_next_idx"
  ON "AgentSchedule" ("organizationId", "nextRunAt");
CREATE INDEX IF NOT EXISTS "AgentSchedule_due_idx"
  ON "AgentSchedule" ("nextRunAt") WHERE "enabled";

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AgentSchedule_agentId_fkey'
  ) THEN
    ALTER TABLE "AgentSchedule"
      ADD CONSTRAINT "AgentSchedule_agentId_fkey"
      FOREIGN KEY ("agentId") REFERENCES "AgentIdentity" ("id") ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE "AgentTask" ADD COLUMN IF NOT EXISTS "scheduleId" uuid;
ALTER TABLE "AgentTask" ADD COLUMN IF NOT EXISTS "scheduledFor" timestamp with time zone;

-- Not a partial index, deliberately. `ON CONFLICT ("scheduleId", "scheduledFor")` can only
-- infer an index whose predicate matches, and a partial index needs that predicate repeated
-- in every INSERT - which failed at runtime with "no unique or exclusion constraint matching
-- the ON CONFLICT specification". A plain unique index is sufficient because Postgres treats
-- NULLs as distinct, so tasks that came from no schedule never collide with each other.
CREATE UNIQUE INDEX IF NOT EXISTS "AgentTask_schedule_slot_key"
  ON "AgentTask" ("scheduleId", "scheduledFor");

ALTER TABLE "AgentTask" ADD COLUMN IF NOT EXISTS "payload" json;

ALTER TABLE "AgentIdentity" ADD COLUMN IF NOT EXISTS "modelProvider" varchar(32);
ALTER TABLE "AgentIdentity" ADD COLUMN IF NOT EXISTS "modelId" varchar(80);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "AgentSchedule") THEN
    NULL; -- empty table is a valid state; this block exists so the migration has a
          -- verification point that fails loudly if the table was not created.
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'AgentSchedule'
  ) THEN
    RAISE EXCEPTION '0038 failed: AgentSchedule was not created';
  END IF;
END $$;
