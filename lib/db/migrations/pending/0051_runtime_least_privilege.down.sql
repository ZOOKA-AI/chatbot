-- Reverses 0051. Safe: it only removes the policies and privileges it added.
DROP POLICY IF EXISTS organization_member_read ON "Organization";
DROP POLICY IF EXISTS organization_owner_update ON "Organization";
DROP POLICY IF EXISTS user_self_read ON "User";
DROP POLICY IF EXISTS user_workspace_read ON "User";
DROP POLICY IF EXISTS user_self_update ON "User";
ALTER TABLE "Organization" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "User" DISABLE ROW LEVEL SECURITY;
REVOKE UPDATE ON "Organization" FROM zooka_runtime;
REVOKE UPDATE ON "User" FROM zooka_runtime;
