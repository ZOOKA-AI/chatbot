-- Paid inference permission, as a row.
--
-- Before this, the spend gate treated any non-empty string as an approval, so a single environment
-- variable authorised an unlimited number of billable jobs with no owner, no price and no expiry.
-- A row can be scoped to a workspace, capped, dated and spent exactly once.
CREATE TABLE IF NOT EXISTS "StudioSpendApproval" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organizationId" varchar(64) NOT NULL,
  "requestedBy" varchar(64) NOT NULL,
  "approvedBy" varchar(64),
  "projectId" uuid,
  "provider" varchar(32) NOT NULL,
  "modelId" varchar(120) NOT NULL,
  "capability" varchar(32) NOT NULL,
  "operation" varchar(64) NOT NULL,
  "maxCostUsd" numeric(10, 4) NOT NULL,
  "quotedCostUsd" numeric(10, 4) NOT NULL,
  "status" varchar(16) NOT NULL DEFAULT 'pending',
  "idempotencyKey" varchar(120) NOT NULL,
  "expiresAt" timestamp NOT NULL,
  "approvedAt" timestamp,
  "consumedAt" timestamp,
  "consumedByJobId" varchar(120),
  "note" text,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

-- A request retried by its own key returns the same row instead of reserving a second budget.
CREATE UNIQUE INDEX IF NOT EXISTS "StudioSpendApproval_org_idempotency_key"
  ON "StudioSpendApproval" ("organizationId", "idempotencyKey");

CREATE INDEX IF NOT EXISTS "StudioSpendApproval_org_status_idx"
  ON "StudioSpendApproval" ("organizationId", "status", "createdAt");

ALTER TABLE "StudioSpendApproval"
  ADD CONSTRAINT "StudioSpendApproval_status_check"
  CHECK ("status" IN ('pending', 'approved', 'consumed', 'revoked', 'uncertain'));

-- A consumed approval must name the job it paid for; an approved one must name who approved it.
ALTER TABLE "StudioSpendApproval"
  ADD CONSTRAINT "StudioSpendApproval_consumed_names_job"
  CHECK ("status" <> 'consumed' OR "consumedByJobId" IS NOT NULL);

ALTER TABLE "StudioSpendApproval"
  ADD CONSTRAINT "StudioSpendApproval_approved_names_actor"
  CHECK ("status" NOT IN ('approved', 'consumed', 'uncertain') OR "approvedBy" IS NOT NULL);
