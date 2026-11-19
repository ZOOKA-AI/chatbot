-- Rollback for 0030. Policies, FORCE and the request role's grants go; the
-- tables, their rows and the role itself stay (dropping a role is a cluster-wide
-- act this migration has no business taking back).
DROP POLICY IF EXISTS "AgentDeployment_tenant_isolation" ON "AgentDeployment";
--> statement-breakpoint
DROP POLICY IF EXISTS "AgentApproval_tenant_isolation" ON "AgentApproval";
--> statement-breakpoint
DROP POLICY IF EXISTS "AgentDecision_tenant_isolation" ON "AgentDecision";
--> statement-breakpoint
DROP POLICY IF EXISTS "AgentTask_tenant_isolation" ON "AgentTask";
--> statement-breakpoint
DROP POLICY IF EXISTS "AgentIdentity_tenant_isolation" ON "AgentIdentity";
--> statement-breakpoint
ALTER TABLE "AgentDeployment" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "AgentApproval" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "AgentDecision" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "AgentTask" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "AgentIdentity" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "AgentDeployment" DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "AgentApproval" DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "AgentDecision" DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "AgentTask" DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "AgentIdentity" DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON
  "AgentIdentity", "AgentTask", "AgentDecision", "AgentApproval", "AgentDeployment"
  FROM zooka_app;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public'
             AND tablename IN ('AgentIdentity','AgentTask','AgentDecision','AgentApproval','AgentDeployment')
             AND rowsecurity) THEN
    RAISE EXCEPTION 'rollback incomplete: RLS still enabled';
  END IF;
END $$;
