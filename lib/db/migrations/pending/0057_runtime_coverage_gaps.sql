-- 0057_runtime_coverage_gaps
--
-- Purpose: make the least-privilege runtime role complete for every table that
-- exists in production today, so the connection can eventually move off the
-- BYPASSRLS owner without a feature going dark.
--
-- Why it is needed: 0051 granted the runtime role on the tables that existed
-- then, and 0056 did the same for the six tables the feature modules used to
-- create at request time. Tables added after those two migrations (referral and
-- reward surfaces, launch program) were never folded into the grant set, and a
-- handful of older tables still carry no row level security at all.
--
-- What it does, in order, and only where the gap actually exists:
--   1. GRANT SELECT, INSERT, UPDATE, DELETE to zooka_runtime on public tables
--      that it currently cannot read.
--   2. GRANT USAGE, SELECT on the sequences those tables own (serial columns
--      are unusable without it).
--   3. ENABLE ROW LEVEL SECURITY on tables that have an organizationId column
--      but no RLS yet, with one tenant policy keyed on app.organization_id.
--   4. RAISE NOTICE for any table that has no RLS and no organizationId column,
--      so that gap is a visible, named decision instead of silent exposure.
--
-- What it deliberately never does:
--   * no CREATE / ALTER / DROP of tables, columns or roles
--   * no GRANT of CREATE on schema public
--   * no ALTER ROLE, no password change
--   * no DISABLE ROW LEVEL SECURITY, no FORCE (the owner role keeps bypassing
--     until the connection itself is moved, which is a separate approved step)
--   * no touch of the bootstrap/system tables listed in the skip list: those are
--     reachable only through the service connection by design
--
-- Idempotent: safe to run twice, and safe to run on a database where the
-- runtime role does not exist (the DO block reports and returns).
--
-- Scope: this file is pending. It is NOT applied to production by this change.

BEGIN;

DO $$
DECLARE
  -- Pre-authentication and platform-owned surfaces. Granting these to the
  -- runtime role would expose token hashes or system state that has no tenant
  -- column, so they stay closed on purpose (see 0052).
  skip_tables text[] := ARRAY[
    '_selfhost_migrations',
    'EmailVerificationToken',
    'PasswordResetToken',
    'GuestUsage',
    'Affiliate',
    'SchedulerRun',
    'WebhookEvent',
    'PhoneOtp'
  ];
  t record;
  s record;
  granted_tables int := 0;
  policies_added int := 0;
  ungated int := 0;
BEGIN
  IF to_regrole('zooka_runtime') IS NULL THEN
    RAISE NOTICE '0057: zooka_runtime absent, nothing to grant';
    RETURN;
  END IF;

  FOR t IN
    SELECT c.relname,
           c.relrowsecurity,
           EXISTS (
             SELECT 1 FROM information_schema.columns col
             WHERE col.table_schema = 'public'
               AND col.table_name = c.relname
               AND col.column_name = 'organizationId'
           ) AS has_tenant_column
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname <> ALL (skip_tables)
  LOOP
    -- 1 + 2. Missing table privilege is the signal that this table predates the
    -- role's grant set or was added after it.
    IF NOT has_table_privilege('zooka_runtime', format('public.%I', t.relname), 'SELECT') THEN
      EXECUTE format(
        'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO zooka_runtime',
        t.relname
      );
      -- Serial columns are unusable without USAGE on their sequence, and a
      -- sequence has no GRANT ... OWNED BY clause: the owning table is found
      -- through pg_depend and each sequence is granted on its own.
      FOR s IN
        SELECT seq.relname AS seqname
        FROM pg_class seq
        JOIN pg_namespace ns ON ns.oid = seq.relnamespace
        JOIN pg_depend dep ON dep.objid = seq.oid AND dep.deptype IN ('a', 'i')
        JOIN pg_class owner_table ON owner_table.oid = dep.refobjid
        WHERE seq.relkind = 'S'
          AND ns.nspname = 'public'
          AND owner_table.relname = t.relname
      LOOP
        EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I TO zooka_runtime', s.seqname);
      END LOOP;
      granted_tables := granted_tables + 1;
    END IF;

    -- 3. Tenant policy only where a tenant column really exists. The policy name
    --    is namespaced to this migration on purpose: 0056 already uses
    --    tenant_isolation, and a generic name here would make the down path drop
    --    somebody else's policy.
    IF NOT t.relrowsecurity AND t.has_tenant_column THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
      EXECUTE format('DROP POLICY IF EXISTS runtime_coverage_tenant ON public.%I', t.relname);
      EXECUTE format(
        'CREATE POLICY runtime_coverage_tenant ON public.%I FOR ALL '
        'USING (("organizationId")::text = current_setting(''app.organization_id'', true)) '
        'WITH CHECK (("organizationId")::text = current_setting(''app.organization_id'', true))',
        t.relname
      );
      policies_added := policies_added + 1;
    END IF;

    -- 4. Name the remaining gap instead of hiding it.
    IF NOT t.relrowsecurity AND NOT t.has_tenant_column THEN
      RAISE NOTICE '0057: table % has no RLS and no organizationId column', t.relname;
      ungated := ungated + 1;
    END IF;
  END LOOP;

  RAISE NOTICE '0057: granted on % tables, added % tenant policies, % tables left ungated deliberately',
    granted_tables, policies_added, ungated;
END
$$;

COMMIT;
