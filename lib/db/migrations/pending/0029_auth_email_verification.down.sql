-- Rollback for 0029. Removes only what it added; User rows are untouched.
DROP TABLE IF EXISTS "EmailVerificationToken";
--> statement-breakpoint
ALTER TABLE "User" DROP COLUMN IF EXISTS "emailVerifiedAt";
--> statement-breakpoint
DROP INDEX IF EXISTS "User_email_lower_key";
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='EmailVerificationToken') THEN
    RAISE EXCEPTION 'rollback incomplete: EmailVerificationToken still exists';
  END IF;
END $$;
