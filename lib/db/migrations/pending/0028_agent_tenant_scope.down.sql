-- Rollback for 0028_agent_tenant_scope.sql.
--
-- Drops only what 0028 added. The five tables, their foreign keys and their
-- existing rows are untouched: the organisation column carries no data of its
-- own beyond the scope, so dropping it returns the schema to its 0027 shape.
-- Quarantined rows ('unclaimed') disappear with the column, which is why this is
-- safe only while no real coordinates have been written under 'unclaimed'.

DROP INDEX IF EXISTS "AgentTask_organizationId_status_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "AgentDeployment_organizationId_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "AgentApproval_organizationId_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "AgentDecision_organizationId_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "AgentTask_organizationId_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "AgentIdentity_organizationId_idx";
--> statement-breakpoint
ALTER TABLE "AgentDeployment" DROP COLUMN IF EXISTS "organizationId";
--> statement-breakpoint
ALTER TABLE "AgentApproval" DROP COLUMN IF EXISTS "organizationId";
--> statement-breakpoint
ALTER TABLE "AgentDecision" DROP COLUMN IF EXISTS "organizationId";
--> statement-breakpoint
ALTER TABLE "AgentTask" DROP COLUMN IF EXISTS "organizationId";
--> statement-breakpoint
ALTER TABLE "AgentIdentity" DROP COLUMN IF EXISTS "organizationId";
--> statement-breakpoint
DO $$
DECLARE leftover int;
BEGIN
  SELECT count(*) INTO leftover
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND column_name = 'organizationId'
    AND table_name IN ('AgentIdentity','AgentTask','AgentDecision','AgentApproval','AgentDeployment');
  IF leftover <> 0 THEN
    RAISE EXCEPTION 'rollback incomplete: % scoped table(s) still hold organizationId', leftover;
  END IF;
END $$;
