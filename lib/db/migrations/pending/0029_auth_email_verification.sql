-- Email verification, and the uniqueness the User table never had.
--
-- Two defects motivated this:
--  1. "User"."email" had no unique constraint, so two concurrent sign-ups could
--     create two accounts with the same address. Sign-in by email then had no
--     single row to identify.
--  2. Verification tokens had nowhere to live, so registration could not be made
--     neutral: an existing address had to be answered differently.
--
-- NOT APPLIED. Requires owner approval, and the code that writes these columns
-- must be deployed with AUTH_EMAIL_VERIFICATION enabled only after that.
--
-- Order matters: the duplicate check runs first so the unique index cannot fail
-- halfway with an opaque message.

DO $$
DECLARE dupes bigint;
BEGIN
  SELECT count(*) INTO dupes FROM (
    SELECT lower(email) FROM "User" GROUP BY lower(email) HAVING count(*) > 1
  ) AS d;
  IF dupes > 0 THEN
    RAISE EXCEPTION 'cannot add unique email: % address(es) are duplicated in "User". Merge them first.', dupes;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_lower_key" ON "User" (lower(email));
--> statement-breakpoint
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerifiedAt" timestamp;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "EmailVerificationToken" (
  "tokenHash" varchar(64) PRIMARY KEY NOT NULL,
  "userId" uuid NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "expiresAt" timestamp NOT NULL,
  "usedAt" timestamp,
  "createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "EmailVerificationToken_userId_idx" ON "EmailVerificationToken" ("userId");
--> statement-breakpoint
DO $$
DECLARE missing int;
BEGIN
  SELECT count(*) INTO missing
  FROM information_schema.columns
  WHERE table_schema='public' AND column_name='emailVerifiedAt' AND table_name='User';
  IF missing <> 1 THEN
    RAISE EXCEPTION 'verification column missing on "User"';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='EmailVerificationToken') THEN
    RAISE EXCEPTION 'EmailVerificationToken table missing';
  END IF;
END $$;
