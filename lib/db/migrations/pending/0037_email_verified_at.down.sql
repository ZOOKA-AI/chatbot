-- Rollback for 0037. `emailVerified` is left untouched by the up migration, so this
-- only removes the column the ORM reads; no verification state is lost from production's
-- own column. Deploying code that selects `emailVerifiedAt` after this rollback fails,
-- which is why the rollback belongs with the code rollback, not before it.
ALTER TABLE "User" DROP COLUMN IF EXISTS "emailVerifiedAt";
