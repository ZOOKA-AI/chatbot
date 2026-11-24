/**
 * DDL for migration 0066: the bootstrap grant of the first platform administrator.
 *
 * 0063 created the tables that decide who may open /admin, but no code path ever
 * writes to them: the admin API routes are read-only and the production database
 * is not reachable from outside the app. So every administrator, the owner
 * included, was refused by a gate that fails closed.
 *
 * The statement inserts only while the table holds no super_admin, which makes
 * the bootstrap one-shot: it cannot resurrect a role that was revoked later
 * while another administrator still holds one.
 *
 * Kept equal to lib/db/migrations/pending/0066_bootstrap_platform_owner.sql by a
 * unit test, for the same reason 0063 is: the endpoint runs this copy, not the file.
 */
export const PLATFORM_OWNER_BOOTSTRAP_DDL: string[] = [
  `INSERT INTO "PlatformRole" ("userId", "role", "grantedBy", "reason")
SELECT 'aad414a8-46a5-4d40-b83c-c569daca8b7c'::uuid,
       'super_admin',
       'migration:0066',
       'Bootstrap: first platform administrator after the role tables were created'
WHERE EXISTS (SELECT 1 FROM "User" WHERE "id" = 'aad414a8-46a5-4d40-b83c-c569daca8b7c'::uuid)
  AND NOT EXISTS (SELECT 1 FROM "PlatformRole" WHERE "role" = 'super_admin')
ON CONFLICT ("userId") DO NOTHING;`,
];
