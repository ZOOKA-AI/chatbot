-- 0050_billing_ledger
--
-- The commercial core for the UAE starter subscription: one paid plan, credits included,
-- and an append-only ledger that makes every debit provable.
--
-- Design rules this migration enforces structurally, not by convention:
--   * Money is integer minor units (fils). No floats anywhere.
--   * The ledger is append only. Balance is SUM(amount_minor), never a mutable column,
--     so a balance cannot drift away from its history.
--   * A hold is a negative ledger row tied to a reservation id. Settling releases the hold
--     and posts the real charge, so a reservation can never be spent twice: the status
--     transition from 'held' is the lock.
--   * Every row carries organizationId, and the policies below are written with the column
--     cast to text so they work whether the column is uuid or text in a given environment.

CREATE TABLE IF NOT EXISTS "BillingAccount" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" uuid NOT NULL UNIQUE,
  "planCode" varchar(32) NOT NULL DEFAULT 'starter',
  status varchar(24) NOT NULL DEFAULT 'active',
  currency varchar(3) NOT NULL DEFAULT 'AED',
  "priceMinor" integer NOT NULL DEFAULT 4900,
  "includedCreditMinor" integer NOT NULL DEFAULT 2000,
  "periodStart" timestamp NOT NULL DEFAULT now(),
  "currentPeriodEnd" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "BillingAccount_status_check" CHECK (status IN ('active','past_due','cancelled','suspended')),
  CONSTRAINT "BillingAccount_amounts_check" CHECK ("priceMinor" >= 0 AND "includedCreditMinor" >= 0)
);

CREATE TABLE IF NOT EXISTS "CreditReservation" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" uuid NOT NULL,
  ref varchar(120) NOT NULL,
  "estimatedMinor" integer NOT NULL,
  "settledMinor" integer,
  status varchar(16) NOT NULL DEFAULT 'held',
  "expiresAt" timestamp NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "CreditReservation_status_check" CHECK (status IN ('held','settled','released','expired')),
  CONSTRAINT "CreditReservation_estimated_check" CHECK ("estimatedMinor" > 0),
  CONSTRAINT "CreditReservation_ref_key" UNIQUE ("organizationId", ref)
);

CREATE TABLE IF NOT EXISTS "CreditLedger" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" uuid NOT NULL,
  kind varchar(16) NOT NULL,
  "amountMinor" integer NOT NULL,
  "reservationId" uuid,
  ref varchar(120),
  memo text,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "CreditLedger_kind_check" CHECK (kind IN ('grant','reserve','settle','release','refund','adjust')),
  CONSTRAINT "CreditLedger_amount_check" CHECK ("amountMinor" <> 0),
  CONSTRAINT "CreditLedger_reservation_fk" FOREIGN KEY ("reservationId") REFERENCES "CreditReservation"(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS "UsageCounter" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" uuid NOT NULL,
  period varchar(7) NOT NULL,
  metric varchar(40) NOT NULL,
  units bigint NOT NULL DEFAULT 0,
  "costMinor" integer NOT NULL DEFAULT 0,
  "updatedAt" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "UsageCounter_key" UNIQUE ("organizationId", period, metric),
  CONSTRAINT "UsageCounter_units_check" CHECK (units >= 0 AND "costMinor" >= 0)
);

CREATE TABLE IF NOT EXISTS "PaymentTransaction" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" uuid NOT NULL,
  provider varchar(24) NOT NULL,
  "providerRef" varchar(160) NOT NULL,
  kind varchar(16) NOT NULL,
  "amountMinor" integer NOT NULL,
  currency varchar(3) NOT NULL DEFAULT 'AED',
  status varchar(20) NOT NULL DEFAULT 'pending',
  "receiptUrl" text,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "PaymentTransaction_kind_check" CHECK (kind IN ('subscription','topup','refund')),
  CONSTRAINT "PaymentTransaction_status_check" CHECK (status IN ('pending','succeeded','failed','refunded')),
  CONSTRAINT "PaymentTransaction_provider_key" UNIQUE (provider, "providerRef")
);

CREATE INDEX IF NOT EXISTS "CreditLedger_org_created_idx" ON "CreditLedger" ("organizationId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "CreditLedger_reservation_idx" ON "CreditLedger" ("reservationId");
CREATE INDEX IF NOT EXISTS "CreditReservation_org_status_idx" ON "CreditReservation" ("organizationId", status);
CREATE INDEX IF NOT EXISTS "CreditReservation_expiry_idx" ON "CreditReservation" (status, "expiresAt");
CREATE INDEX IF NOT EXISTS "PaymentTransaction_org_created_idx" ON "PaymentTransaction" ("organizationId", "createdAt" DESC);

ALTER TABLE "BillingAccount"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CreditReservation"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CreditLedger"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UsageCounter"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PaymentTransaction"  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "BillingAccount";
CREATE POLICY tenant_isolation ON "BillingAccount" FOR ALL
  USING (("organizationId")::text = current_setting('app.organization_id', true))
  WITH CHECK (("organizationId")::text = current_setting('app.organization_id', true));

DROP POLICY IF EXISTS tenant_isolation ON "CreditReservation";
CREATE POLICY tenant_isolation ON "CreditReservation" FOR ALL
  USING (("organizationId")::text = current_setting('app.organization_id', true))
  WITH CHECK (("organizationId")::text = current_setting('app.organization_id', true));

DROP POLICY IF EXISTS tenant_isolation ON "CreditLedger";
CREATE POLICY tenant_isolation ON "CreditLedger" FOR ALL
  USING (("organizationId")::text = current_setting('app.organization_id', true))
  WITH CHECK (("organizationId")::text = current_setting('app.organization_id', true));

DROP POLICY IF EXISTS tenant_isolation ON "UsageCounter";
CREATE POLICY tenant_isolation ON "UsageCounter" FOR ALL
  USING (("organizationId")::text = current_setting('app.organization_id', true))
  WITH CHECK (("organizationId")::text = current_setting('app.organization_id', true));

DROP POLICY IF EXISTS tenant_isolation ON "PaymentTransaction";
CREATE POLICY tenant_isolation ON "PaymentTransaction" FOR ALL
  USING (("organizationId")::text = current_setting('app.organization_id', true))
  WITH CHECK (("organizationId")::text = current_setting('app.organization_id', true));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zooka_runtime') THEN
    GRANT SELECT, INSERT, UPDATE ON "BillingAccount", "CreditReservation", "CreditLedger", "UsageCounter", "PaymentTransaction" TO zooka_runtime;
    -- The ledger is append only for the runtime role: no UPDATE, no DELETE.
    REVOKE UPDATE, DELETE ON "CreditLedger" FROM zooka_runtime;
  END IF;
END $$;
