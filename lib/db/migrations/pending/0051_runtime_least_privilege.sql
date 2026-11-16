-- 0051_runtime_least_privilege
--
-- Closes the gap measured on the Preview database on 2026-11-16: the runtime role
-- had no privileges on Organization and User (so moving the application off the
-- BYPASSRLS owner role would break sign-in), and neither table carried row level
-- security at all (so the runtime role could enumerate every workspace).
--
-- Deliberately NOT granted here, and therefore fail-closed for the runtime role:
--   EmailVerificationToken, PasswordResetToken  -> used only by the bootstrap
--     connection; granting them to the runtime role would expose token hashes
--     across tenants and they have no tenant column worth scoping.
--   GuestUsage, Affiliate, SchedulerRun, WebhookEvent, _selfhost_migrations
--     -> system surfaces owned by the platform connection.
--
-- Scope: Preview only. Nothing in this file touches Production.

-- Organization: a member reads the workspace they belong to; an owner edits it.
ALTER TABLE "Organization" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organization_member_read ON "Organization";
CREATE POLICY organization_member_read ON "Organization" FOR SELECT USING (
  id::text = current_setting('app.organization_id', true)
  OR EXISTS (
    SELECT 1 FROM "OrganizationMember" m
    WHERE m."organizationId" = "Organization".id
      AND m."userId"::text = current_setting('app.user_id', true)
  )
);

DROP POLICY IF EXISTS organization_owner_update ON "Organization";
CREATE POLICY organization_owner_update ON "Organization" FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM "OrganizationMember" m
    WHERE m."organizationId" = "Organization".id
      AND m."userId"::text = current_setting('app.user_id', true)
      AND m.role = 'owner'
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM "OrganizationMember" m
    WHERE m."organizationId" = "Organization".id
      AND m."userId"::text = current_setting('app.user_id', true)
      AND m.role = 'owner'
  )
);

-- User: read yourself, or a member of the workspace you are scoped to. Update
-- only your own row. Insert is intentionally absent: accounts are created by the
-- bootstrap connection during registration.
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_self_read ON "User";
CREATE POLICY user_self_read ON "User" FOR SELECT USING (
  id::text = current_setting('app.user_id', true)
);

DROP POLICY IF EXISTS user_workspace_read ON "User";
CREATE POLICY user_workspace_read ON "User" FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM "OrganizationMember" m
    WHERE m."userId" = "User".id
      AND m."organizationId"::text = current_setting('app.organization_id', true)
  )
);

DROP POLICY IF EXISTS user_self_update ON "User";
CREATE POLICY user_self_update ON "User" FOR UPDATE USING (
  id::text = current_setting('app.user_id', true)
) WITH CHECK (
  id::text = current_setting('app.user_id', true)
);

-- Least privilege for the runtime role on the two tables it now legitimately
-- reads. No DELETE, no INSERT: neither has a tenant-scoped use here.
GRANT SELECT, UPDATE ON "Organization" TO zooka_runtime;
GRANT SELECT, UPDATE ON "User" TO zooka_runtime;
REVOKE INSERT, DELETE ON "Organization" FROM zooka_runtime;
REVOKE INSERT, DELETE ON "User" FROM zooka_runtime;
