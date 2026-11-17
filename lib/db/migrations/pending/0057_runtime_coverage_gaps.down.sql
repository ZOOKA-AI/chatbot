-- 0057_runtime_coverage_gaps (down)
--
-- Removes exactly what this migration added that is unambiguously reversible:
-- the runtime_coverage_tenant policies and the RLS enablement on the tables where the
-- policy was created.
--
-- Deliberately NOT reverted: the table/sequence GRANTs. They are additive,
-- they grant nothing beyond ordinary DML on tables the application already
-- owns conceptually, and revoking them could dark a running feature at a moment
-- when somebody is rolling back for an unrelated reason. If the grants must also
-- go, that is a separate, explicit decision; the statement to do it is:
--
--   REVOKE ALL ON ALL TABLES IN SCHEMA public FROM zooka_runtime;
--   REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM zooka_runtime;
--
-- Note: row level security stays enabled on tables where it was already on
-- before this migration. Nothing here disables RLS.

BEGIN;

DO $$
DECLARE
  t record;
  dropped int := 0;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_policies
    WHERE schemaname = 'public' AND policyname = 'runtime_coverage_tenant'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS runtime_coverage_tenant ON public.%I', t.tablename);
    EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t.tablename);
    dropped := dropped + 1;
  END LOOP;
  RAISE NOTICE '0057 down: removed % runtime_coverage_tenant policies', dropped;
END
$$;

COMMIT;
