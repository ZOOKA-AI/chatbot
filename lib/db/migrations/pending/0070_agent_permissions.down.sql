-- Roll back only the additive settings columns; existing row policies remain intact.
ALTER TABLE "AgentIdentity"
  DROP COLUMN IF EXISTS "updateWithoutApproval",
  DROP COLUMN IF EXISTS "deleteWithoutApproval",
  DROP COLUMN IF EXISTS "sendMessagesWithoutApproval";
