DROP INDEX IF EXISTS "AgentExecution_org_status_idx";
DROP INDEX IF EXISTS "AgentExecution_idempotencyKey_key";
ALTER TABLE "AgentExecution" DROP COLUMN IF EXISTS "recoveredFrom";
ALTER TABLE "AgentExecution" DROP COLUMN IF EXISTS "idempotencyKey";
ALTER TABLE "AgentExecution" DROP COLUMN IF EXISTS "heartbeatAt";
ALTER TABLE "AgentExecution" DROP COLUMN IF EXISTS "leaseExpiresAt";
DROP TABLE IF EXISTS "SchedulerRun";
-- integration_connection is left alone: it belongs to the integrations module.
