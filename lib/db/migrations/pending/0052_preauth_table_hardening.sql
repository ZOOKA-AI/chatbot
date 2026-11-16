-- 0052 — Pre-auth and system table hardening.
--
-- Seven tables had no RLS. Each is classified here:
--   Affiliate              system-owned reference data -> RLS on, SELECT-only for runtime
--   EmailVerificationToken bootstrap-only (read before a session exists) -> no runtime access
--   PasswordResetToken     bootstrap-only              -> no runtime access
--   GuestUsage             bootstrap-only (pre-auth)   -> no runtime access
--   SchedulerRun           system-owned telemetry      -> no runtime access
--   WebhookEvent           system-owned inbound ledger -> no runtime access
--   _selfhost_migrations   migration metadata          -> no runtime access
--
-- "No runtime access" is enforced twice: privileges are revoked from zooka_runtime,
-- and RLS stays enabled with no policy so a future accidental grant still yields
-- zero rows. The application reaches these tables through the bootstrap/service
-- connection (adminDb()), never through the tenant runtime role.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zooka_runtime') THEN
    RAISE NOTICE '0052: zooka_runtime absent, skipping grants (non-preview database)';
  END IF;
END $$;

-- 1. Affiliate: global reference data, readable but never writable at runtime.
ALTER TABLE "Affiliate" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS affiliate_reference_read ON "Affiliate";
CREATE POLICY affiliate_reference_read ON "Affiliate"
  FOR SELECT TO zooka_runtime USING (true);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zooka_runtime') THEN
    GRANT SELECT ON "Affiliate" TO zooka_runtime;
    REVOKE INSERT, UPDATE, DELETE ON "Affiliate" FROM zooka_runtime;
  END IF;
END $$;

-- 2. Bootstrap-only and system-owned tables: RLS on, no policy, no runtime grants.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'EmailVerificationToken',
    'PasswordResetToken',
    'GuestUsage',
    'SchedulerRun',
    'WebhookEvent',
    '_selfhost_migrations'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_runtime_deny', t);
    EXECUTE format('REVOKE ALL ON %I FROM PUBLIC', t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zooka_runtime') THEN
      EXECUTE format('REVOKE ALL ON %I FROM zooka_runtime', t);
    END IF;
  END LOOP;
END $$;

COMMIT;
