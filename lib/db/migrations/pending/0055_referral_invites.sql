-- Email invitations for the referral program.
--
-- Two rules shape this schema:
--   1. The invited address is never stored, only a keyed hash, so a leaked dump
--      cannot be used to mail or identify anyone.
--   2. Sending is per-inviter rate limited and consult a suppression list, so
--      the feature cannot be turned into a bulk mailer.
--
-- Access model matches 0054: RLS on, no policies. The runtime role cannot read
-- or write these tables at all; server code uses the bootstrap connection only.

CREATE TABLE IF NOT EXISTS "ReferralInvite" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "inviterUserId" uuid NOT NULL,
  "emailHash" varchar(64) NOT NULL,
  "status" varchar(16) DEFAULT 'sent' NOT NULL,
  "token" varchar(64) NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ReferralInvite_token_key" UNIQUE ("token"),
  CONSTRAINT "ReferralInvite_inviter_email_key" UNIQUE ("inviterUserId", "emailHash")
);

CREATE INDEX IF NOT EXISTS "ReferralInvite_inviter_created_idx"
  ON "ReferralInvite" ("inviterUserId", "createdAt");

CREATE TABLE IF NOT EXISTS "EmailSuppression" (
  "emailHash" varchar(64) PRIMARY KEY NOT NULL,
  "reason" varchar(32) DEFAULT 'unsubscribed' NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "EmailSuppression_emailHash_key" UNIQUE ("emailHash")
);

ALTER TABLE "ReferralInvite" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmailSuppression" ENABLE ROW LEVEL SECURITY;
