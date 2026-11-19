DROP INDEX IF EXISTS "AgentDecision_approvalId_key";
ALTER TABLE "AgentDecision" DROP COLUMN IF EXISTS "approvalId";
