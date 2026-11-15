-- Rollback for 0031: revoke what was granted, then drop the role.
-- Dropping the role is safe only because it owns nothing (0031 asserts that on
-- the way up); if it ever owned an object this would fail loudly, which is
-- the correct outcome.
REVOKE ALL ON
  "AgentIdentity", "AgentTask", "AgentDecision", "AgentApproval", "AgentDeployment"
  FROM zooka_runtime;
--> statement-breakpoint
REVOKE USAGE ON SCHEMA public FROM zooka_runtime;
--> statement-breakpoint
DO $$
BEGIN
  EXECUTE format('REVOKE CONNECT ON DATABASE %I FROM zooka_runtime', current_database());
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zooka_runtime') THEN
    DROP ROLE zooka_runtime;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zooka_runtime') THEN
    RAISE EXCEPTION 'rollback incomplete: role still present';
  END IF;
END $$;
