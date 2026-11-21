-- 0067_signup_attribution
--
-- The growth funnel could not be measured: "User" had no creation timestamp and
-- no acquisition channel, so a signup could never be joined to the visit that
-- produced it. "Which channel brings people who actually use the product" was
-- unanswerable from the database, only guessable from a separate analytics tool.
--
-- createdAt is added WITHOUT a default and WITHOUT NOT NULL on purpose. Adding
-- the column with DEFAULT now() would rewrite the table and stamp every existing
-- account with the migration's own timestamp, which reads as a signup date and
-- is not one. Owner requirement: an unknown historical date stays unknown.
-- Existing rows therefore keep NULL, and the default is attached afterwards,
-- where it applies only to rows inserted from now on.
--
-- The four attribution columns stay nullable for the same reason: a direct visit
-- has no channel, and a placeholder would invent data.
--
-- No RLS change: these columns belong to the existing "User" row, and the
-- policies from 0022/0062 already govern that row.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "createdAt" timestamp;
ALTER TABLE "User" ALTER COLUMN "createdAt" SET DEFAULT now();
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "signupSource" varchar(64);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "signupMedium" varchar(64);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "signupCampaign" varchar(64);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "signupReferrer" varchar(190);
