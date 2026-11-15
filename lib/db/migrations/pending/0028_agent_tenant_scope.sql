-- Commander tenant scope.
--
-- AgentIdentity, AgentTask, AgentDecision, AgentApproval and AgentDeployment
-- were created (0027) without any organisation column. Every list query and the
-- claim update therefore ran across the whole table: once a second workspace
-- registered an agent, its owner would list and claim the first workspace's
-- tasks, decisions and deployment records. Today the tables are empty in
-- production, so nothing has leaked; the shape is the defect.
--
-- NOT APPLIED. Apply only after the code that filters on "organizationId" is
-- deployed, and only with owner approval.
--
-- The default 'unclaimed' exists so the column can be added NOT NULL to a table
-- that already has rows. New writes always set the caller's organisation, so a
-- row left at 'unclaimed' is visible to nobody and can be inspected by hand.

ALTER TABLE "AgentIdentity" ADD COLUMN IF NOT EXISTS "organizationId" varchar(64) NOT NULL DEFAULT 'unclaimed';
--> statement-breakpoint
ALTER TABLE "AgentTask" ADD COLUMN IF NOT EXISTS "organizationId" varchar(64) NOT NULL DEFAULT 'unclaimed';
--> statement-breakpoint
ALTER TABLE "AgentDecision" ADD COLUMN IF NOT EXISTS "organizationId" varchar(64) NOT NULL DEFAULT 'unclaimed';
--> statement-breakpoint
ALTER TABLE "AgentApproval" ADD COLUMN IF NOT EXISTS "organizationId" varchar(64) NOT NULL DEFAULT 'unclaimed';
--> statement-breakpoint
ALTER TABLE "AgentDeployment" ADD COLUMN IF NOT EXISTS "organizationId" varchar(64) NOT NULL DEFAULT 'unclaimed';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "AgentIdentity_organizationId_idx" ON "AgentIdentity" ("organizationId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "AgentTask_organizationId_idx" ON "AgentTask" ("organizationId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "AgentDecision_organizationId_idx" ON "AgentDecision" ("organizationId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "AgentApproval_organizationId_idx" ON "AgentApproval" ("organizationId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "AgentDeployment_organizationId_idx" ON "AgentDeployment" ("organizationId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "AgentTask_organizationId_status_idx" ON "AgentTask" ("organizationId", "status");
--> statement-breakpoint
-- Self-check: fail loudly rather than leave a half-scoped table behind.
DO $$
DECLARE missing int;
BEGIN
  SELECT count(*) INTO missing
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND column_name = 'organizationId'
    AND table_name IN ('AgentIdentity','AgentTask','AgentDecision','AgentApproval','AgentDeployment');
  IF missing <> 5 THEN
    RAISE EXCEPTION 'agent tenant scope incomplete: % of 5 tables have organizationId', missing;
  END IF;
END $$;

-- Report, do not hide, any row that could not be attributed. The tables are
-- empty today, so a healthy run notices 0; a non-zero count means legacy rows
-- exist and must be re-assigned by hand before that data is used again.
DO $$
DECLARE quarantined bigint;
BEGIN
  SELECT count(*) INTO quarantined FROM "AgentIdentity" WHERE "organizationId" = 'unclaimed';
  IF quarantined > 0 THEN
    RAISE NOTICE '0028: % AgentIdentity row(s) quarantined as unclaimed', quarantined;
  END IF;
END $$;

-- ROLLBACK lives in 0028_agent_tenant_scope.down.sql so it can be run as one
-- step instead of pasted by hand:
--   DROP INDEX IF EXISTS "AgentDeployment_organizationId_idx";
--   DROP INDEX IF EXISTS "AgentApproval_organizationId_idx";
--   DROP INDEX IF EXISTS "AgentDecision_organizationId_idx";
--   DROP INDEX IF EXISTS "AgentTask_organizationId_status_idx";
--   DROP INDEX IF EXISTS "AgentTask_organizationId_idx";
--   DROP INDEX IF EXISTS "AgentIdentity_organizationId_idx";
--   ALTER TABLE "AgentDeployment" DROP COLUMN IF EXISTS "organizationId";
--   ALTER TABLE "AgentApproval"   DROP COLUMN IF EXISTS "organizationId";
--   ALTER TABLE "AgentDecision"   DROP COLUMN IF EXISTS "organizationId";
--   ALTER TABLE "AgentTask"       DROP COLUMN IF EXISTS "organizationId";
--   ALTER TABLE "AgentIdentity"   DROP COLUMN IF EXISTS "organizationId";
