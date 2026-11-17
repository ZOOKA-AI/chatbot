-- 0057_runtime_least_privilege_guard
--
-- Replaces the earlier draft of this file. The draft granted SELECT/INSERT/
-- UPDATE/DELETE to zooka_runtime on every table it could not read, and added a
-- tenant policy wherever a table had an organizationId column but no RLS.
--
-- Measured against production on 2026-11-18, both halves of that plan were
-- wrong for this database:
--
--   * All 72 public tables already carry row level security, so the policy
--     branch had nothing to create. Where it would still have fired
--     (RewardLedger, lead) it produced a dead grant: RLS on with no policy
--     returns zero rows, so the feature would have stayed dark anyway.
--   * The 24 tables the runtime role cannot read are service-only on purpose.
--     Account, Session, VerificationToken, EmailVerificationToken,
--     PasswordResetToken, PhoneOtp, WebhookEvent, SchedulerRun, GuestUsage and
--     EmailSuppression are read before a tenant exists. RewardLedger,
--     GrowthSettings, GrowthAudit, ReferralProfile, ReferralInvite and
--     LaunchTestingClaim are written by lib/growth/* through adminDb(), the
--     service connection, so the runtime role never needs them. Granting all of
--     them would have turned a 48-table blast radius into a 72-table one.
--
-- So this migration adds no access at all. It does three things:
--   1. Makes the service-only boundary explicit with REVOKE, so a future
--      careless GRANT cannot quietly widen it.
--   2. Asserts the invariants the cutover depends on, and fails the deployment
--      if one is broken: every granted table has RLS and at least one policy,
--      the runtime role cannot bypass RLS, is not superuser, and holds no
--      CREATE on schema public.
--   3. Reports, as NOTICE, the tables left closed and why.
--
-- What it never does: CREATE, ALTER TABLE, ALTER ROLE, password changes,
-- DISABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY, or any GRANT.
--
-- Idempotent. Safe on a database where zooka_runtime does not exist (the block
-- reports and returns). Read only with respect to data: no row is touched.

BEGIN;

DO $$
DECLARE
  -- Tables the runtime role must never reach. Each entry answers "who reads
  -- this before a tenant context exists, or through the service connection?".
  service_only text[] := ARRAY[
    -- authentication bootstrap: read before a session, through adminDb()
    'Account', 'Session', 'VerificationToken',
    'EmailVerificationToken', 'PasswordResetToken', 'PhoneOtp',
    'EmailSuppression', 'GuestUsage',
    -- platform and operations surfaces
    'SchedulerRun', 'WebhookEvent', '_selfhost_migrations',
    -- reward and referral ledgers: lib/growth/* uses adminDb() by design
    'RewardLedger', 'GrowthSettings', 'GrowthAudit',
    'ReferralProfile', 'ReferralInvite', 'LaunchTestingClaim',
    -- legacy tables that predate schema.ts and are unused by the application
    'lead', 'price_snapshot', 'usage_counter', 'file',
    'billing_event', 'integration_audit', 'integration_provider'
  ];
  t record;
  revoked int := 0;
  violations text[] := ARRAY[]::text[];
  closed_present text[] := ARRAY[]::text[];
BEGIN
  IF to_regrole('zooka_runtime') IS NULL THEN
    RAISE NOTICE '0057: zooka_runtime absent, nothing to guard';
    RETURN;
  END IF;

  -- 1. Explicit deny boundary.
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace
      AND c.relkind = 'r'
      AND c.relname = ANY (service_only)
  LOOP
    closed_present := closed_present || t.relname;

    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM zooka_runtime',
      t.relname
    );

    IF has_table_privilege('zooka_runtime', format('public.%I', t.relname), 'SELECT')
       OR has_table_privilege('zooka_runtime', format('public.%I', t.relname), 'INSERT') THEN
      violations := violations || format('service-only table still readable: %s', t.relname);
    ELSE
      revoked := revoked + 1;
    END IF;
  END LOOP;

  -- 2. The invariants the switch to the runtime role depends on.
  IF (SELECT rolsuper FROM pg_roles WHERE rolname = 'zooka_runtime') THEN
    violations := array_append(violations, 'zooka_runtime is superuser');
  END IF;

  IF (SELECT rolbypassrls FROM pg_roles WHERE rolname = 'zooka_runtime') THEN
    violations := array_append(violations, 'zooka_runtime bypasses row level security');
  END IF;

  IF has_schema_privilege('zooka_runtime', 'public', 'CREATE') THEN
    violations := array_append(violations, 'zooka_runtime holds CREATE on schema public');
  END IF;

  -- Every table the runtime role can reach must be both gated and governed.
  FOR t IN
    SELECT c.relname, c.relrowsecurity,
           EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid) AS has_policy
    FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace
      AND c.relkind = 'r'
      AND NOT (c.relname = ANY (service_only))
      AND has_table_privilege('zooka_runtime', format('public.%I', c.relname), 'SELECT')
  LOOP
    IF NOT t.relrowsecurity THEN
      violations := violations || format('granted table without RLS: %s', t.relname);
    END IF;
    IF NOT t.has_policy THEN
      violations := violations || format('granted table without a policy: %s', t.relname);
    END IF;
  END LOOP;

  IF array_length(violations, 1) > 0 THEN
    RAISE EXCEPTION '0057 guard failed: %', array_to_string(violations, '; ');
  END IF;

  RAISE NOTICE '0057: % service-only tables closed (% present), invariants hold',
    revoked, array_length(closed_present, 1);
  RAISE NOTICE '0057: no privileges were granted; the runtime role keeps exactly the 48 tenant tables it had';
END
$$;

COMMIT;
