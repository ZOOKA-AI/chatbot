-- 0067_signup_attribution (down)
--
-- Drops the growth columns. The data they hold is lost, which is the point of a
-- rollback: the pre-0067 shape is restored exactly.
ALTER TABLE "User" DROP COLUMN IF EXISTS "signupReferrer";
ALTER TABLE "User" DROP COLUMN IF EXISTS "signupCampaign";
ALTER TABLE "User" DROP COLUMN IF EXISTS "signupMedium";
ALTER TABLE "User" DROP COLUMN IF EXISTS "signupSource";
ALTER TABLE "User" DROP COLUMN IF EXISTS "createdAt";
