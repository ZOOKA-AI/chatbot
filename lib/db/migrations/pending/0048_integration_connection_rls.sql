-- 0048_integration_connection_rls
--
-- Closes the last tenant-data table that 0035 explicitly deferred ("belongs to
-- the integrations module") and that 0046/0047 never picked up.
--
-- integration_connection stores one provider credential per workspace, with
-- encrypted_tokens as the payload. zooka_runtime holds SELECT on it so the
-- worker can resolve a workspace's own credential. With no policy, that same
-- grant let any tenant-scoped request read every workspace's credential rows.
-- Verified on the Preview database: as zooka_runtime the table returned rows
-- for every workspace regardless of app.organization_id.
--
-- Ownership model: the row belongs to the workspace that connected it, and
-- workspace_id is that workspace's id. Runtime is read-only here (0035 grants
-- SELECT only), so a SELECT policy is the whole surface.
--
-- Idempotent.

BEGIN;

ALTER TABLE integration_connection ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON integration_connection;
CREATE POLICY tenant_isolation ON integration_connection FOR SELECT
  USING (
    workspace_id = current_setting('app.organization_id', true)
  );

COMMIT;
