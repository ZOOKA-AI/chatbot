-- Rollback for 0027_agent_command_center.
--
-- Scope: drops exactly the five tables 0027 creates, in reverse foreign-key
-- order, and touches nothing else. It is safe to run on a database where 0027 was
-- applied and never used (all five tables empty) — which is the only situation in
-- which a rollback should be considered: once approvals or decisions exist, those
-- rows are the audit trail and dropping them destroys evidence.
--
-- After this runs, the previous application code (which never references these
-- tables) is the matching state. Verify with:
--   select count(*) from information_schema.tables
--    where table_schema = 'public'
--      and "tableName" in ('AgentIdentity','AgentTask','AgentDecision',
--                          'AgentApproval','AgentDeployment');

DROP TABLE IF EXISTS "AgentApproval";
--> statement-breakpoint
DROP TABLE IF EXISTS "AgentDeployment";
--> statement-breakpoint
DROP TABLE IF EXISTS "AgentDecision";
--> statement-breakpoint
DROP TABLE IF EXISTS "AgentTask";
--> statement-breakpoint
DROP TABLE IF EXISTS "AgentIdentity";
