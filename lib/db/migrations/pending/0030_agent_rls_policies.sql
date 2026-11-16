-- Row-level security for the Commander tables.
--
-- Re-appliable: each policy is dropped-if-exists before it is created, so a second run changes
-- nothing. The first rehearsal of this migration on a disposable cluster failed on exactly that:
-- a plain CREATE POLICY is not idempotent, and a migration that cannot be re-run cannot be trusted
-- in a release window where a half-applied state has to be corrected.
--
-- NOT APPLIED. Read the two limits at the end before applying: this file alone
-- does NOT make the current deployment tenant-safe.
--
-- WHAT THIS FILE ESTABLISHES
--   * RLS enabled AND forced on the five Commander tables, so a non-superuser
--     table owner is still constrained (FORCE is what covers ownership).
--   * A request role, zooka_app, that is NOLOGIN, NOSUPERUSER, NOBYPASSRLS, and
--     holds no ownership of these tables. Superusers and BYPASSRLS roles ignore
--     every policy in PostgreSQL, so the role separation is part of the control,
--     not a detail.
--   * One policy per table on the tenant column, with WITH CHECK, so a mismatch
--     fails on INSERT and UPDATE as well as being invisible to SELECT/DELETE.
--
-- HOW THE TENANT IS ASSERTED
--     begin;
--     select set_config('app.organization_id', $1, true);   -- is_local = true
--     ... every statement for this request ...
--     commit;
--   The explicit transaction is not optional. With is_local = true PostgreSQL
--   scopes the value to the current transaction; outside one, each statement is
--   its own transaction and the setting is gone by the next statement. That fails
--   closed (no tenant, no rows), which is the safe direction, but it also means a
--   caller that forgets the transaction gets nothing instead of its data.
--   is_local = false is the opposite trap: it works, and the value then survives
--   on the pooled connection into whichever request borrows it next.

ALTER TABLE "AgentIdentity" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "AgentTask" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "AgentDecision" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "AgentApproval" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "AgentDeployment" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "AgentIdentity" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "AgentTask" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "AgentDecision" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "AgentApproval" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "AgentDeployment" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "AgentIdentity_tenant_isolation" ON "AgentIdentity";
CREATE POLICY "AgentIdentity_tenant_isolation" ON "AgentIdentity"
  FOR ALL
  USING ("organizationId" = current_setting('app.organization_id', true))
  WITH CHECK ("organizationId" = current_setting('app.organization_id', true));
--> statement-breakpoint
DROP POLICY IF EXISTS "AgentTask_tenant_isolation" ON "AgentTask";
CREATE POLICY "AgentTask_tenant_isolation" ON "AgentTask"
  FOR ALL
  USING ("organizationId" = current_setting('app.organization_id', true))
  WITH CHECK ("organizationId" = current_setting('app.organization_id', true));
--> statement-breakpoint
DROP POLICY IF EXISTS "AgentDecision_tenant_isolation" ON "AgentDecision";
CREATE POLICY "AgentDecision_tenant_isolation" ON "AgentDecision"
  FOR ALL
  USING ("organizationId" = current_setting('app.organization_id', true))
  WITH CHECK ("organizationId" = current_setting('app.organization_id', true));
--> statement-breakpoint
DROP POLICY IF EXISTS "AgentApproval_tenant_isolation" ON "AgentApproval";
CREATE POLICY "AgentApproval_tenant_isolation" ON "AgentApproval"
  FOR ALL
  USING ("organizationId" = current_setting('app.organization_id', true))
  WITH CHECK ("organizationId" = current_setting('app.organization_id', true));
--> statement-breakpoint
DROP POLICY IF EXISTS "AgentDeployment_tenant_isolation" ON "AgentDeployment";
CREATE POLICY "AgentDeployment_tenant_isolation" ON "AgentDeployment"
  FOR ALL
  USING ("organizationId" = current_setting('app.organization_id', true))
  WITH CHECK ("organizationId" = current_setting('app.organization_id', true));
--> statement-breakpoint
-- The request role. Every attribute that would void RLS is set explicitly, and
-- the block refuses to continue if the role already exists with them wrong.
DO $$
DECLARE bad int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zooka_app') THEN
    CREATE ROLE zooka_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
  SELECT count(*) INTO bad FROM pg_roles
   WHERE rolname = 'zooka_app' AND (rolsuper OR rolbypassrls);
  IF bad <> 0 THEN
    RAISE EXCEPTION 'zooka_app must not be superuser or BYPASSRLS';
  END IF;
END $$;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON
  "AgentIdentity", "AgentTask", "AgentDecision", "AgentApproval", "AgentDeployment"
  TO zooka_app;
--> statement-breakpoint
REVOKE ALL ON
  "AgentIdentity", "AgentTask", "AgentDecision", "AgentApproval", "AgentDeployment"
  FROM PUBLIC;
--> statement-breakpoint
-- Self-check: policies, force, and role attributes, or refuse to report success.
DO $$
DECLARE unprotected int; unforced int; bad int;
BEGIN
  SELECT count(*) INTO unprotected FROM pg_tables
   WHERE schemaname='public'
     AND tablename IN ('AgentIdentity','AgentTask','AgentDecision','AgentApproval','AgentDeployment')
     AND NOT rowsecurity;
  SELECT count(*) INTO unforced FROM pg_class
   WHERE relname IN ('AgentIdentity','AgentTask','AgentDecision','AgentApproval','AgentDeployment')
     AND relkind='r' AND NOT relforcerowsecurity;
  SELECT count(*) INTO bad FROM pg_roles WHERE rolname='zooka_app' AND (rolsuper OR rolbypassrls);
  IF unprotected <> 0 THEN RAISE EXCEPTION 'RLS missing on % Commander table(s)', unprotected; END IF;
  IF unforced <> 0 THEN RAISE EXCEPTION 'FORCE RLS missing on % Commander table(s)', unforced; END IF;
  IF bad <> 0 THEN RAISE EXCEPTION 'zooka_app can bypass RLS'; END IF;
END $$;

-- LIMIT 1 — the tenant setting is caller-asserted.
--   app.organization_id is a plain custom GUC. Anything that can execute SQL on
--   this connection can set it to any value, so the policy protects against a
--   query that forgot its predicate, NOT against an attacker who controls SQL.
--   Trusting it requires that the value is written only by code that resolved the
--   workspace from the verified session and never from a request field. That is
--   asserted in tests/unit/commander-authorization-boundaries.test.ts and in the
--   route layer, and it is why route code must keep taking the organisation from
--   the caller, not from the body.
--
-- LIMIT 2 — the application currently connects as a superuser.
--   On this deployment DATABASE_URL authenticates as "postgres", which is a
--   superuser. Superusers ignore RLS even with FORCE, so until the application
--   connects as zooka_app (or another non-superuser, non-owner role) these
--   policies constrain nobody but other roles. Enabling them is safe and is a
--   precondition, not a fix: the connection change is the fix, and it is a
--   deployment decision that needs the owner's approval.
