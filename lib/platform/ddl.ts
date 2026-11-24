/**
 * DDL for the platform administration tables (migration 0063).
 *
 * The admin migration endpoint is what production actually runs, so this array
 * must describe exactly the same change as
 * lib/db/migrations/pending/0063_platform_roles.sql; a unit test normalises both
 * and refuses any drift. Approving one thing and applying another is how a
 * platform administrator gets locked out of the panel that grants them access.
 *
 * Both tables carry no policy on purpose: they are read and written only on the
 * owner/service connection and the tenant runtime role is revoked outright, so a
 * forged tenant context cannot read the grant list or grant itself a role. RLS is
 * enabled but not forced, which is what keeps the owner able to use the table.
 */
export const PLATFORM_ROLES_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS "PlatformRole" (
  "userId" uuid PRIMARY KEY NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "role" varchar NOT NULL,
  "grantedBy" varchar(128) NOT NULL,
  "reason" text NOT NULL,
  "grantedAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "PlatformRole_role_check" CHECK ("role" IN ('super_admin', 'admin'))
);`,
  `CREATE TABLE IF NOT EXISTS "PlatformAuditLog" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "actorUserId" uuid,
  "action" varchar(64) NOT NULL,
  "target" varchar(256),
  "outcome" varchar(16) NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL
);`,
  `CREATE INDEX IF NOT EXISTS "PlatformAuditLog_created_idx" ON "PlatformAuditLog" ("createdAt");`,
  `ALTER TABLE "PlatformRole" ENABLE ROW LEVEL SECURITY;`,
  `ALTER TABLE "PlatformAuditLog" ENABLE ROW LEVEL SECURITY;`,
  `DO $$
BEGIN
  IF to_regrole('zooka_runtime') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON "PlatformRole", "PlatformAuditLog" FROM zooka_runtime';
  END IF;
  IF to_regrole('zooka_app') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON "PlatformRole", "PlatformAuditLog" FROM zooka_app';
  END IF;
END $$;`,
  `DO $$
BEGIN
  EXECUTE 'REVOKE ALL ON "PlatformRole", "PlatformAuditLog" FROM PUBLIC';
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON "PlatformRole", "PlatformAuditLog" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON "PlatformRole", "PlatformAuditLog" FROM authenticated';
  END IF;
END $$;`,
];
