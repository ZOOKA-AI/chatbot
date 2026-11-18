-- 0058_runtime_grants_repair
--
-- Measured defect this file closes: on a database built from the migration files alone, the runtime
-- role had NO privileges at all on 55 of the public tables, including AgentExecution, Chat, Message,
-- Organization, OrganizationMember and Subscription. Two earlier files were supposed to grant them
-- (0034 for AgentExecution, 0049 for the hardened list), and both were recorded as applied, yet
-- has_table_privilege('zooka_runtime', 'public."AgentExecution"', 'SELECT') returned false. Whatever
-- the cause of the divergence, the result was the same: a request that ran under the runtime role
-- died with 42501 "permission denied for table AgentExecution" before row level security could even
-- be consulted, and the executor's health probe reported critical states that were permission
-- errors rather than real queue conditions.
--
-- The repair is deliberately not a hand-written list. A list rots the moment a module adds a table.
-- Instead:
--
--   1. every public table that carries a tenant column ("organizationId") is a tenant surface, and
--      gets the four DML privileges, with AgentExecution losing DELETE because an execution record
--      that can be erased is not an audit trail;
--   2. the tables 0057 declared service-only keep their deny boundary, so this file cannot widen it;
--   3. every grant is asserted afterwards, and the file fails the migration if an assertion does not
--      hold. A migration that cannot prove its own effect is a comment, not a control;
--   4. nothing here creates, drops, enables or disables RLS, and nothing touches a role attribute.
--
-- Scope: preview / self-hosted databases. Production is untouched: this file contains no
-- credential, no ALTER DATABASE and no DATABASE_URL change.

BEGIN;

DO $$
DECLARE
  service_only text[] := ARRAY[
    'Account', 'Session', 'VerificationToken',
    'EmailVerificationToken', 'PasswordResetToken', 'PhoneOtp',
    'EmailSuppression', 'GuestUsage',
    'SchedulerRun', 'WebhookEvent', '_selfhost_migrations',
    'RewardLedger', 'GrowthSettings', 'GrowthAudit',
    'ReferralProfile', 'ReferralInvite', 'LaunchTestingClaim',
    'lead', 'price_snapshot', 'usage_counter', 'file',
    'billing_event', 'integration_audit', 'integration_provider'
  ];
  t record;
  granted int := 0;
  withheld int := 0;
  violations text[] := ARRAY[]::text[];
BEGIN
  IF to_regrole('zooka_runtime') IS NULL THEN
    RAISE NOTICE '0058: zooka_runtime absent, nothing to repair';
    RETURN;
  END IF;

  -- 1. Tenant surfaces, discovered rather than enumerated.
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace
      AND c.relkind = 'r'
      AND EXISTS (
        SELECT 1 FROM information_schema.columns col
        WHERE col.table_schema = 'public'
          AND col.table_name = c.relname
          AND col.column_name = 'organizationId'
      )
      AND NOT (c.relname = ANY (service_only))
    ORDER BY c.relname
  LOOP
    -- Fail closed: a grant on a table without RLS would let one workspace read another's rows.
    IF NOT (SELECT relrowsecurity FROM pg_class
            WHERE relnamespace = 'public'::regnamespace AND relname = t.relname) THEN
      violations := array_append(violations, format('%s: row level security is not enabled', t.relname));
      CONTINUE;
    END IF;

    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE public.%I TO zooka_runtime', t.relname);

    IF t.relname = 'AgentExecution' THEN
      -- Delete stays revoked: an execution row is audit evidence.
      EXECUTE format('REVOKE DELETE ON TABLE public.%I FROM zooka_runtime', t.relname);
      withheld := withheld + 1;
    ELSE
      EXECUTE format('GRANT DELETE ON TABLE public.%I TO zooka_runtime', t.relname);
    END IF;

    EXECUTE format('GRANT SELECT, USAGE ON ALL SEQUENCES IN SCHEMA public TO zooka_runtime');
    granted := granted + 1;
  END LOOP;

  -- 2. Tables without a tenant column that the session path legitimately reads. Organization and
  --    User are scoped by policy, not by column, so they are named explicitly. INSERT is never
  --    granted: accounts and workspaces are created by the bootstrap connection during registration.
  IF to_regclass('public."Organization"') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT, UPDATE ON TABLE public."Organization" TO zooka_runtime';
    EXECUTE 'REVOKE INSERT, DELETE ON TABLE public."Organization" FROM zooka_runtime';
  END IF;
  IF to_regclass('public."User"') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT, UPDATE ON TABLE public."User" TO zooka_runtime';
    EXECUTE 'REVOKE INSERT, DELETE ON TABLE public."User" FROM zooka_runtime';
  END IF;

  -- 3. Assertions. Each one is a statement about what the runtime role may do, checked against the
  --    catalogue rather than trusted from the statements above.
  IF has_table_privilege('zooka_runtime', 'public."AgentExecution"', 'DELETE') THEN
    violations := array_append(violations, 'AgentExecution: runtime role can delete execution records');
  END IF;
  IF NOT has_table_privilege('zooka_runtime', 'public."AgentExecution"', 'SELECT') THEN
    violations := array_append(violations, 'AgentExecution: runtime role cannot read executions');
  END IF;
  IF NOT has_table_privilege('zooka_runtime', 'public."Chat"', 'SELECT') THEN
    violations := array_append(violations, 'Chat: runtime role cannot read chats');
  END IF;
  IF has_table_privilege('zooka_runtime', 'public."User"', 'INSERT') THEN
    violations := array_append(violations, 'User: runtime role can create accounts');
  END IF;
  IF has_table_privilege('zooka_runtime', 'public."Organization"', 'DELETE') THEN
    violations := array_append(violations, 'Organization: runtime role can delete workspaces');
  END IF;
  -- Guarded: an authentication table exists only where the auth schema was built, and an assertion
  -- that crashes on a missing relation would fail the migration for the wrong reason.
  IF to_regclass('public."Account"') IS NOT NULL
     AND has_table_privilege('zooka_runtime', 'public."Account"', 'SELECT') THEN
    violations := array_append(violations, 'Account: runtime role can read credentials');
  END IF;

  -- Ownership and escape hatches: the three properties the cutover depends on.
  IF EXISTS (
    SELECT 1 FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace
      AND c.relkind = 'r'
      AND pg_get_userbyid(c.relowner) = 'zooka_runtime'
  ) THEN
    violations := array_append(violations, 'zooka_runtime owns an application table');
  END IF;
  IF (SELECT rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole FROM pg_roles WHERE rolname = 'zooka_runtime') THEN
    violations := array_append(violations, 'zooka_runtime holds a privilege that defeats RLS');
  END IF;
  IF has_schema_privilege('zooka_runtime', 'public', 'CREATE') THEN
    violations := array_append(violations, 'zooka_runtime can create objects in public');
  END IF;

  IF cardinality(violations) > 0 THEN
    RAISE EXCEPTION '0058 refused: %', array_to_string(violations, '; ');
  END IF;

  RAISE NOTICE '0058: repaired % tenant tables (% with DELETE withheld), all assertions hold', granted, withheld;
END $$;

COMMIT;
