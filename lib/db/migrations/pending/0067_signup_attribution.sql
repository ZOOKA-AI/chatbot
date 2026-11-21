-- 0067_signup_attribution
--
-- The growth funnel could not be measured: "User" had no creation timestamp and
-- no acquisition channel, so a signup could never be joined to the visit that
-- produced it. "Which channel brings people who actually use the product" was
-- unanswerable from the database, only guessable from a separate analytics tool.
--
-- createdAt defaults to now() so the column is NOT NULL without a backfill. The
-- honest consequence: accounts that already exist receive this migration's
-- timestamp, so they must not be read as real signup dates. Historical signup
-- dates are not recoverable from this table.
--
-- The four attribution columns stay nullable on purpose. A direct visit with no
-- referrer has no channel, and writing a placeholder would invent data.
--
-- No RLS change: these columns belong to the existing "User" row, and the
-- policies from 0022 already govern that row.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "createdAt" timestamp NOT NULL DEFAULT now();
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "signupSource" varchar(64);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "signupMedium" varchar(64);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "signupCampaign" varchar(64);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "signupReferrer" varchar(190);
