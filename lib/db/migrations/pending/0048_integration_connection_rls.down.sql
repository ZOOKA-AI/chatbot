-- Rollback for 0048: removes the policy and returns the table to unprotected,
-- which is the state the repository shipped before this migration.
BEGIN;
DROP POLICY IF EXISTS tenant_isolation ON integration_connection;
ALTER TABLE integration_connection DISABLE ROW LEVEL SECURITY;
COMMIT;
