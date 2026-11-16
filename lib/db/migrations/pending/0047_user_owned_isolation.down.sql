-- 0047 (down): restores 0046's organisation-only policies and unpolices Suggestion.
-- No data is rewritten. Idempotent.
BEGIN;

DROP POLICY IF EXISTS tenant_isolation ON "OrganizationMember";
CREATE POLICY tenant_isolation ON "OrganizationMember" FOR ALL
  USING (("organizationId")::text = current_setting('app.organization_id', true))
  WITH CHECK (("organizationId")::text = current_setting('app.organization_id', true));

DROP POLICY IF EXISTS tenant_isolation ON "Invitation";
CREATE POLICY tenant_isolation ON "Invitation" FOR ALL
  USING (("organizationId")::text = current_setting('app.organization_id', true))
  WITH CHECK (("organizationId")::text = current_setting('app.organization_id', true));

DROP POLICY IF EXISTS user_isolation ON "Suggestion";
ALTER TABLE "Suggestion" DISABLE ROW LEVEL SECURITY;

COMMIT;
