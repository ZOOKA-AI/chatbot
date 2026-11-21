-- 0066_bootstrap_platform_owner
--
-- The platform role tables were created by 0063 but nothing ever grants a role,
-- so /admin refuses everyone including the owner: the gate reads PlatformRole
-- and fails closed. There is no HTTP route that grants a role (the admin routes
-- are read-only), and the production connection string is not reachable from
-- outside the app, so the only path that can write this row is the admin
-- migration endpoint.
--
-- This is a bootstrap, not a standing grant: it inserts only when the table
-- holds no super_admin at all. Once an administrator exists the statement is a
-- no-op, so re-running the migration endpoint never restores a role that was
-- deliberately revoked while another administrator remains.
--
-- The user id is the owner's account, verified present in "User" by the
-- pre-migration backup taken immediately before this window. The same existence
-- check is what makes this file safe on an empty database: CI applies every
-- pending file to a fresh Postgres, where the account does not exist and the
-- foreign key would otherwise reject the row and fail the migration step.
INSERT INTO "PlatformRole" ("userId", "role", "grantedBy", "reason")
SELECT 'aad414a8-46a5-4d40-b83c-c569daca8b7c'::uuid,
       'super_admin',
       'migration:0066',
       'Bootstrap: first platform administrator after the role tables were created'
WHERE EXISTS (SELECT 1 FROM "User" WHERE "id" = 'aad414a8-46a5-4d40-b83c-c569daca8b7c'::uuid)
  AND NOT EXISTS (SELECT 1 FROM "PlatformRole" WHERE "role" = 'super_admin')
ON CONFLICT ("userId") DO NOTHING;
