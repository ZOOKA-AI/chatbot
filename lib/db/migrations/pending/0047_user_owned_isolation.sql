-- 0047_user_owned_isolation
--
-- Completes the ownership model that 0046 deliberately left alone.
--
-- 0046 put row level security on OrganizationMember. That is read by
-- getWorkspaceForUser() *by userId, before any organisation is known*, so with a
-- plain organisation policy every login would resolve zero memberships and no
-- workspace. The same is true of invitations addressed to an email.
--
-- Ownership here therefore has two legitimate keys: the organisation and the
-- user. Reads may satisfy either. Writes must satisfy the organisation, except
-- for Suggestion which is a user's own row.
--
-- Still deliberately NOT policed, with reasons:
--   "User"          read by email during sign-in, before any session exists. A
--                   policy would make login impossible; isolation there is the
--                   auth layer's job. Grants stay SELECT/INSERT/UPDATE only.
--   "Organization"  looked up by id after membership is proven, and created
--                   during registration with no context at all.
--
-- Idempotent.

BEGIN;

-- 1. Membership: readable by the member, writable only inside the organisation.
DROP POLICY IF EXISTS tenant_isolation ON "OrganizationMember";
CREATE POLICY tenant_isolation ON "OrganizationMember" FOR ALL
  USING (
    ("organizationId")::text = current_setting('app.organization_id', true)
    OR ("userId")::text = current_setting('app.user_id', true)
  )
  WITH CHECK (("organizationId")::text = current_setting('app.organization_id', true));

-- 2. Invitations: readable by the organisation or by the invitee.
DROP POLICY IF EXISTS tenant_isolation ON "Invitation";
CREATE POLICY tenant_isolation ON "Invitation" FOR ALL
  USING (
    ("organizationId")::text = current_setting('app.organization_id', true)
    OR "email" = (
      SELECT u."email" FROM "User" u
      WHERE u."id" = nullif(current_setting('app.user_id', true), '')::uuid
    )
  )
  WITH CHECK (("organizationId")::text = current_setting('app.organization_id', true));

-- 3. Suggestion is the user's own row: ownership is userId, not organisation.
ALTER TABLE "Suggestion" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_isolation ON "Suggestion";
CREATE POLICY user_isolation ON "Suggestion" FOR ALL
  USING (("userId")::text = current_setting('app.user_id', true))
  WITH CHECK (("userId")::text = current_setting('app.user_id', true));

COMMIT;
