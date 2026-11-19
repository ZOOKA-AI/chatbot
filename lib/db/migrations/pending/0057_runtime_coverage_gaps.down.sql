-- 0057_runtime_least_privilege_guard (down)
--
-- This migration grants nothing and creates nothing, so there is nothing to
-- undo: every statement in the up file is either a REVOKE on a privilege the
-- runtime role did not hold, or an assertion that raises without changing state.
--
-- The file is kept because the runner pairs every up with a down, and because a
-- silent no-op is safer than a "rollback" that re-grants service-only tables to
-- the runtime role. The rollback that actually matters for this work is the
-- cutover rollback (point DATABASE_URL back at the owner role), documented in
-- docs/security/0057_TENANT_ISOLATION_ASSESSMENT.md.

DO $$
BEGIN
  RAISE NOTICE '0057 down: nothing to revert, no privilege and no policy was created';
END
$$;
