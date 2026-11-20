-- 0063_platform_roles
--
-- NOT APPLIED. Production needs the owner's explicit approval for this file and
-- for the bootstrap grant that follows it (scripts/admin/platform-role.mjs).
--
-- Until now /admin admitted anyone whose role in their *own* workspace was owner or
-- admin, so every new sign-up (who owns a fresh workspace) could open it. Platform
-- administration needs its own grant, held per immutable user id, that workspace
-- ownership cannot produce.
--
-- Both tables are read and written only on the owner/service connection. Row level
-- security is enabled with no policies (and not forced, so the table owner keeps
-- access), so the tenant runtime role sees nothing and cannot grant itself
-- anything, even with a forged tenant context.

CREATE TABLE IF NOT EXISTS "PlatformRole" (
  "userId" uuid PRIMARY KEY NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "role" varchar NOT NULL,
  "grantedBy" varchar(128) NOT NULL,
  "reason" text NOT NULL,
  "grantedAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "PlatformRole_role_check" CHECK ("role" IN ('super_admin', 'admin'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "PlatformAuditLog" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "actorUserId" uuid,
  "action" varchar(64) NOT NULL,
  "target" varchar(256),
  "outcome" varchar(16) NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "PlatformAuditLog_created_idx" ON "PlatformAuditLog" ("createdAt");
--> statement-breakpoint
ALTER TABLE "PlatformRole" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "PlatformAuditLog" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regrole('zooka_runtime') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON "PlatformRole", "PlatformAuditLog" FROM zooka_runtime';
  END IF;
  IF to_regrole('zooka_app') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON "PlatformRole", "PlatformAuditLog" FROM zooka_app';
  END IF;
END $$;
