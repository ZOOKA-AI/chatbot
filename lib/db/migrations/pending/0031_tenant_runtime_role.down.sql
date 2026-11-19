-- Rollback for 0031: revoke what was granted, then drop the role.
-- Dropping the role is safe only because it owns nothing (0031 asserts that on
-- the way up); if it ever owned an object this would fail loudly, which is
-- the correct outcome.
-- Revoke across the whole schema, not only the five tables this migration granted.
--
-- Migrations after 0031 grant the same request role privileges on their own tables (projects,
-- documents, studio assets, executions). The first rollback rehearsal revoked the five and the
-- assertion then failed on the other six, which is the assertion doing its job: a rollback that
-- leaves the request role able to read customer tables is not a rollback.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM zooka_runtime;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM zooka_runtime;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM zooka_runtime;
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
-- A role belongs to the cluster, not to this database. If any other database on the same server
-- has granted it something, DROP ROLE fails with "objects in database ..." and always will. The
-- first rehearsal hit exactly that: three development databases in one cluster, and the rollback
-- aborted while this database was already clean. So the drop is attempted, and a dependency in
-- another database is reported as a notice with the databases named, rather than as a failure of
-- this rollback.
DO $$
DECLARE
  blocked text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zooka_runtime') THEN
    RETURN;
  END IF;
  BEGIN
    DROP ROLE zooka_runtime;
  EXCEPTION WHEN dependent_objects_still_exist THEN
    SELECT string_agg(DISTINCT datname, ', ')
      INTO blocked
      FROM pg_shdepend d
      JOIN pg_database b ON b.oid = d.dbid
     WHERE d.refobjid = (SELECT oid FROM pg_roles WHERE rolname = 'zooka_runtime')
       AND d.dbid IS NOT NULL;
    RAISE NOTICE 'zooka_runtime still referenced in: %. This database is clean; run the grants rollback in those databases before dropping the role cluster-wide.', COALESCE(blocked, 'unknown');
  END;
END $$;
--> statement-breakpoint
-- The assertion is now scoped to what this database can guarantee: it no longer grants the role
-- anything and no longer holds it as an owner of these tables. Cluster-wide removal is a separate,
-- observable step (the notice above names where it is still referenced).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
     WHERE grantee = 'zooka_runtime' AND table_schema = 'public'
  ) THEN
    RAISE EXCEPTION 'rollback incomplete: grants remain in this database';
  END IF;
END $$;
