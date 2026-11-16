-- Rollback for 0036. Destroys the soft-delete timestamps, so any chat deleted since the
-- migration becomes indistinguishable from a live one. Run it only on a database where
-- that is true, and take a backup first: `select count(*) from "Chat" where "deletedAt" is not null`
-- tells you how many rows you are about to resurrect.
DROP INDEX IF EXISTS "Chat_organizationId_deletedAt_idx";
ALTER TABLE "Chat" DROP COLUMN IF EXISTS "deletedAt";
