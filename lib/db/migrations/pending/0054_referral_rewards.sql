-- Referral rewards: per-user referral code, a points ledger with idempotency,
-- owner-tunable reward settings and an append-only audit trail.
--
-- Points are promotional and non-cashable. Nothing here can create API credit,
-- change a Subscription row, or touch billing.
--
-- Access model: all four tables have RLS enabled with no policies, so they are
-- unreadable through the runtime role by construction. Server code reaches them
-- only on the bootstrap connection after resolving the caller from the session.

CREATE TABLE IF NOT EXISTS "ReferralProfile" (
  "userId" uuid PRIMARY KEY NOT NULL,
  "code" varchar(24) NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ReferralProfile_code_key" UNIQUE ("code")
);

CREATE TABLE IF NOT EXISTS "RewardLedger" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organizationId" uuid,
  "userId" uuid NOT NULL,
  "kind" varchar(40) NOT NULL,
  "points" integer NOT NULL,
  "status" varchar(16) DEFAULT 'pending' NOT NULL,
  "idempotencyKey" varchar(160) NOT NULL,
  "referredUserId" uuid,
  "note" text,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "revokedAt" timestamp with time zone,
  CONSTRAINT "RewardLedger_idempotencyKey_key" UNIQUE ("idempotencyKey")
);

CREATE INDEX IF NOT EXISTS "RewardLedger_userId_createdAt_idx" ON "RewardLedger" ("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "RewardLedger_referredUserId_idx" ON "RewardLedger" ("referredUserId");

CREATE TABLE IF NOT EXISTS "GrowthSettings" (
  "id" varchar(16) PRIMARY KEY NOT NULL DEFAULT 'default',
  "programEnabled" boolean DEFAULT true NOT NULL,
  "pointsWelcome" integer DEFAULT 20 NOT NULL,
  "pointsReferrerVerified" integer DEFAULT 50 NOT NULL,
  "pointsReferrerFirstTask" integer DEFAULT 100 NOT NULL,
  "pointsFirstTask" integer DEFAULT 30 NOT NULL,
  "ambassadorThreshold" integer DEFAULT 5 NOT NULL,
  "bonusAtTenReferrals" integer DEFAULT 500 NOT NULL,
  "monthlyBudgetPoints" integer DEFAULT 100000 NOT NULL,
  "emailInvitesEnabled" boolean DEFAULT false NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);

INSERT INTO "GrowthSettings" ("id") VALUES ('default') ON CONFLICT ("id") DO NOTHING;

CREATE TABLE IF NOT EXISTS "GrowthAudit" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "actorUserId" uuid,
  "action" varchar(48) NOT NULL,
  "detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "ReferralProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RewardLedger" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GrowthSettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GrowthAudit" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zooka_runtime') THEN
    REVOKE ALL ON TABLE "ReferralProfile", "RewardLedger", "GrowthSettings", "GrowthAudit" FROM zooka_runtime;
  END IF;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'granting role lacks privilege to revoke; leaving grants untouched';
END $$;

-- Audit rows are append-only: no update, no delete, ever.
CREATE OR REPLACE FUNCTION "GrowthAudit_no_mutation"() RETURNS trigger AS $fn$
BEGIN
  RAISE EXCEPTION 'GrowthAudit is append-only';
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "GrowthAudit_block_update" ON "GrowthAudit";
CREATE TRIGGER "GrowthAudit_block_update" BEFORE UPDATE OR DELETE ON "GrowthAudit"
FOR EACH ROW EXECUTE FUNCTION "GrowthAudit_no_mutation"();
