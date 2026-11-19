-- Rollback for 0058.
--
-- The grants this file adds are the ones the runtime role needs in order to work at all, so rolling
-- back is a deliberate act: it returns the database to the broken-but-strict state where the runtime
-- role could not read its own tables. It does not touch RLS, ownership, role attributes or data, and
-- it cannot widen anything. Re-applying 0058 restores the grants.
DO $$
BEGIN
  RAISE NOTICE '0058 down: no automatic revoke. Revoke by hand if the runtime role must be silenced again.';
END $$;
