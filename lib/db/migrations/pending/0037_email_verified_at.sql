-- `emailVerifiedAt`: the column the ORM reads, which production does not have.
--
-- `lib/db/schema.ts` selects `User.emailVerifiedAt`. Production's User table instead
-- carries `emailVerified`, the older Auth.js spelling, so the two disagree: the code on
-- this branch would fail the first time it reads that column against production, and
-- every query that joins to the session user carries it.
--
-- Adding the column production lacks is the corrective direction this milestone should
-- take, because the alternative — renaming the ORM to `emailVerified` — would make
-- local, preview and test databases wrong instead. Existing values are copied across so
-- no verification state is lost, and nothing is dropped: `emailVerified` stays where it
-- is until somebody decides, with evidence, that it is unused.
--
-- Idempotent, and safe on a database that has neither column (fresh install) or only one.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerifiedAt" timestamp;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'User' AND column_name = 'emailVerified'
  ) THEN
    EXECUTE 'UPDATE "User" SET "emailVerifiedAt" = "emailVerified" WHERE "emailVerifiedAt" IS NULL AND "emailVerified" IS NOT NULL';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'User' AND column_name = 'emailVerifiedAt'
  ) THEN
    RAISE EXCEPTION 'reconciliation failed: User.emailVerifiedAt is still missing';
  END IF;
END $$;
