-- Reverses 0052. Restores the previous state: no RLS on the seven tables and no
-- Affiliate grant. The runtime role loses access it never had before 0052.
BEGIN;

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
    EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS affiliate_reference_read ON "Affiliate";
ALTER TABLE "Affiliate" DISABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zooka_runtime') THEN
    REVOKE ALL ON "Affiliate" FROM zooka_runtime;
  END IF;
END $$;

COMMIT;
