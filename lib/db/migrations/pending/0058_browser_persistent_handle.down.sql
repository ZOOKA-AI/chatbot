DROP INDEX IF EXISTS "BrowserSession_target_idx";
ALTER TABLE "BrowserSession"
  DROP COLUMN IF EXISTS "targetId",
  DROP COLUMN IF EXISTS "browserContextId";
