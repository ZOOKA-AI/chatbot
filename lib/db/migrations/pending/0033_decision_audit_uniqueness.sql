-- One audit record per approval decision.
--
-- The decision and its audit row are written in one transaction, but a unique
-- index is what makes "no duplicate decision records" a property of the database
-- instead of a promise made by one function. Partial: older free-form decisions
-- have no approval, and many of those are legitimate.
ALTER TABLE "AgentDecision" ADD COLUMN IF NOT EXISTS "approvalId" uuid;

CREATE UNIQUE INDEX IF NOT EXISTS "AgentDecision_approvalId_key"
  ON "AgentDecision" ("approvalId")
  WHERE "approvalId" IS NOT NULL;
