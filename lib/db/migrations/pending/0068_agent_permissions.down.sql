ALTER TABLE "AgentIdentity"
  DROP COLUMN IF EXISTS "updateWithoutApproval",
  DROP COLUMN IF EXISTS "deleteWithoutApproval",
  DROP COLUMN IF EXISTS "sendMessagesWithoutApproval";
