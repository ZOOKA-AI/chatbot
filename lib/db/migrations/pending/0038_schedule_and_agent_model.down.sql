-- Reverse of 0038. Drops only what this migration added, and only if the columns exist.
DROP INDEX IF EXISTS "AgentTask_schedule_slot_key";
ALTER TABLE "AgentTask" DROP COLUMN IF EXISTS "scheduledFor";
ALTER TABLE "AgentTask" DROP COLUMN IF EXISTS "scheduleId";
ALTER TABLE "AgentTask" DROP COLUMN IF EXISTS "payload";
ALTER TABLE "AgentIdentity" DROP COLUMN IF EXISTS "modelProvider";
ALTER TABLE "AgentIdentity" DROP COLUMN IF EXISTS "modelId";
DROP TABLE IF EXISTS "AgentSchedule";
