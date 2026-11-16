-- Rollback for 0029. Removes only what it added; User rows are untouched.
-- Forward-only guard.
--
-- This migration created the table below, so dropping it is the correct inverse. What is not correct is
-- dropping it while it holds rows: every row written since the deploy would disappear with nothing said.
-- Data loss must be a decision, not a side effect of a zero exit code.
DO $$
DECLARE rows_present bigint;
BEGIN
  IF to_regclass('public."EmailVerificationToken"') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM "EmailVerificationToken"' INTO rows_present;
    IF rows_present > 0 THEN
      RAISE EXCEPTION 'forward_only: "EmailVerificationToken" holds % row(s); rollback refused to discard them', rows_present
        USING HINT = 'Export the rows, delete them deliberately, or restore the pre-migration backup. See docs/release/ROLLBACK_PLAN.md.';
    END IF;
  END IF;
END $$;

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
