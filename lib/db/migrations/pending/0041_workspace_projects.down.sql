-- Rollback for 0041. Drops the links first, then the table, so no foreign key is left dangling.
ALTER TABLE "AgentTask" DROP COLUMN IF EXISTS "projectId";
ALTER TABLE "AgentSchedule" DROP COLUMN IF EXISTS "projectId";
ALTER TABLE "AgentIdentity" DROP COLUMN IF EXISTS "projectId";
DROP TABLE IF EXISTS "AgentProject";
