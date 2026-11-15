-- A LOGIN role for tenant-scoped application requests.
--
-- NOT APPLIED. Preview only, behind TENANT_RLS_ENABLED.
--
-- 0030 created zooka_app as NOLOGIN: a privilege holder, not something that can
-- authenticate. This migration adds the role that actually connects, and keeps it
-- deliberately unable to do anything beyond read and write the five Commander
-- tables through RLS.
--
-- WHAT zooka_runtime IS
--   LOGIN        it authenticates with its own credentials
--   NOSUPERUSER  so it cannot ignore RLS
--   NOBYPASSRLS  same, explicitly
--   NOCREATEDB, NOCREATEROLE  it cannot make objects or other roles
--   NOINHERIT    it inherits nothing from any group role it might be added to
--   not the owner of any protected table, so DDL (including DISABLE RLS) fails
--
-- WHY IT IS NOT A MEMBER OF zooka_app
--   Membership would let it SET ROLE zooka_app, and SET ROLE is a privilege
--   transition that is easy to lose track of. It gets the four DML privileges
--   directly instead, and the migration proves it is a member of nothing.
--
-- THE PASSWORD IS NOT HERE
--   A role is created without a password, so it cannot authenticate until one is
--   set out of band (ALTER ROLE zooka_runtime PASSWORD ...) from the secret
--   manager at deploy time. No credential in source, no credential in history.

DO $$
DECLARE existing record;
BEGIN
  SELECT rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolinherit, rolcanlogin
    INTO existing FROM pg_roles WHERE rolname = 'zooka_runtime';

  IF NOT FOUND THEN
    CREATE ROLE zooka_runtime LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
  ELSE
    -- An existing role with the wrong attributes is an error, never a silent pass.
    IF existing.rolsuper OR existing.rolbypassrls OR existing.rolcreatedb
       OR existing.rolcreaterole OR existing.rolinherit OR NOT existing.rolcanlogin THEN
      RAISE EXCEPTION 'zooka_runtime exists with unsafe attributes';
    END IF;
  END IF;
END $$;
--> statement-breakpoint
-- Start from nothing, then grant exactly four rights on exactly five tables.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM zooka_runtime;
--> statement-breakpoint
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM zooka_runtime;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM zooka_runtime;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO zooka_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON
  "AgentIdentity", "AgentTask", "AgentDecision", "AgentApproval", "AgentDeployment"
  TO zooka_runtime;
--> statement-breakpoint
DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO zooka_runtime', current_database());
END $$;
--> statement-breakpoint
-- Self-check: every property this design depends on, or refuse.
DO $$
DECLARE r record; m int; owned int; can_create boolean;
BEGIN
  SELECT rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolinherit, rolcanlogin
    INTO r FROM pg_roles WHERE rolname = 'zooka_runtime';
  IF r IS NULL THEN RAISE EXCEPTION 'zooka_runtime missing'; END IF;
  IF r.rolsuper OR r.rolbypassrls THEN RAISE EXCEPTION 'zooka_runtime can bypass RLS'; END IF;
  IF r.rolcreatedb OR r.rolcreaterole THEN RAISE EXCEPTION 'zooka_runtime can create objects'; END IF;
  IF r.rolinherit THEN RAISE EXCEPTION 'zooka_runtime inherits privileges'; END IF;
  IF NOT r.rolcanlogin THEN RAISE EXCEPTION 'zooka_runtime cannot log in'; END IF;

  -- Member of no role at all: SET ROLE has nowhere to escalate to.
  SELECT count(*) INTO m FROM pg_auth_members WHERE member = (SELECT oid FROM pg_roles WHERE rolname='zooka_runtime');
  IF m <> 0 THEN RAISE EXCEPTION 'zooka_runtime is a member of % role(s)', m; END IF;

  -- Owns none of the protected tables: DDL and DISABLE RLS are out of reach.
  SELECT count(*) INTO owned FROM pg_class c JOIN pg_roles ro ON ro.oid = c.relowner
   WHERE ro.rolname = 'zooka_runtime'
     AND c.relname IN ('AgentIdentity','AgentTask','AgentDecision','AgentApproval','AgentDeployment');
  IF owned <> 0 THEN RAISE EXCEPTION 'zooka_runtime owns % protected table(s)', owned; END IF;

  SELECT has_schema_privilege('zooka_runtime','public','CREATE') INTO can_create;
  IF can_create THEN RAISE EXCEPTION 'zooka_runtime can create objects in public'; END IF;
END $$;
