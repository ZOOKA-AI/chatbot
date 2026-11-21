/**
 * DDL for the two migrations that were missing from the admin migration registry.
 *
 * The registry in app/api/admin/migrate/route.ts is what actually runs in
 * production; a pending .sql file that is not listed there is never applied, and
 * the endpoint still answers 200 with an empty failure map. 0063 (platform roles)
 * and 0065 (publish queue) were in exactly that state, so /admin stayed locked for
 * everyone and the scheduler had no table to drain.
 *
 * Both arrays are generated from the pending files, and a unit test asserts they
 * stay equal after whitespace normalisation, so the file and the production path
 * cannot drift apart again.
 */
/** 0063_platform_roles.sql */
export const PLATFORM_ROLES_0063_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS "PlatformRole" (
  "userId" uuid PRIMARY KEY NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "role" varchar NOT NULL,
  "grantedBy" varchar(128) NOT NULL,
  "reason" text NOT NULL,
  "grantedAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "PlatformRole_role_check" CHECK ("role" IN ('super_admin', 'admin'))
)`,
  `CREATE TABLE IF NOT EXISTS "PlatformAuditLog" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "actorUserId" uuid,
  "action" varchar(64) NOT NULL,
  "target" varchar(256),
  "outcome" varchar(16) NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL
)`,
  `CREATE INDEX IF NOT EXISTS "PlatformAuditLog_created_idx" ON "PlatformAuditLog" ("createdAt")`,
  `ALTER TABLE "PlatformRole" ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE "PlatformAuditLog" ENABLE ROW LEVEL SECURITY`,
  `DO $$
BEGIN
  IF to_regrole('zooka_runtime') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON "PlatformRole", "PlatformAuditLog" FROM zooka_runtime';
  END IF;
  IF to_regrole('zooka_app') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON "PlatformRole", "PlatformAuditLog" FROM zooka_app';
  END IF;
END $$`,
  `DO $$
BEGIN
  EXECUTE 'REVOKE ALL ON "PlatformRole", "PlatformAuditLog" FROM PUBLIC';
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON "PlatformRole", "PlatformAuditLog" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON "PlatformRole", "PlatformAuditLog" FROM authenticated';
  END IF;
END $$`,
];

/** 0065_tiktok_publish_jobs.sql */
export const TIKTOK_PUBLISH_JOBS_0065_DDL: string[] = [
  `create table if not exists "TikTokPublishJob" (
  "id" uuid primary key default gen_random_uuid(),
  "organizationId" uuid not null references "Organization"("id") on delete cascade,
  "userId" uuid not null references "User"("id") on delete cascade,
  "jobKey" varchar(128) not null,
  "mediaUrl" varchar(2048) not null,
  "caption" varchar(2200),
  "status" varchar(24) not null default 'PENDING',
  "attempts" integer not null default 0,
  "claimedAt" timestamp,
  "publishId" varchar(128),
  "lastError" varchar(300),
  "nextAttemptAt" timestamp,
  "lastAttemptAt" timestamp,
  "deadAt" timestamp,
  "createdAt" timestamp not null default now(),
  "updatedAt" timestamp not null default now()
)`,
  `create unique index if not exists "TikTokPublishJob_org_jobkey_key"
  on "TikTokPublishJob" ("organizationId", "jobKey")`,
  `create index if not exists "TikTokPublishJob_due_idx"
  on "TikTokPublishJob" ("organizationId", "status", "createdAt")`,
  `alter table "TikTokPublishJob" enable row level security`,
  `drop policy if exists "TikTokPublishJob_tenant" on "TikTokPublishJob"`,
  `create policy "TikTokPublishJob_tenant" on "TikTokPublishJob"
  for all
  using (
    ("organizationId")::text = current_setting('app.organization_id', true)
    and public.app_is_org_member(current_setting('app.organization_id', true))
  )
  with check (
    ("organizationId")::text = current_setting('app.organization_id', true)
    and public.app_is_org_member(current_setting('app.organization_id', true))
  )`,
  `grant select, insert, update, delete on "TikTokPublishJob" to zooka_runtime`,
  `create table if not exists "TikTokPublishEvent" (
  "id" uuid primary key default gen_random_uuid(),
  "jobId" uuid not null references "TikTokPublishJob"("id") on delete cascade,
  "organizationId" uuid not null references "Organization"("id") on delete cascade,
  "userId" uuid not null references "User"("id") on delete cascade,
  "type" varchar(32) not null,
  "detail" varchar(300),
  "createdAt" timestamp not null default now()
)`,
  `create index if not exists "TikTokPublishEvent_job_idx"
  on "TikTokPublishEvent" ("jobId", "createdAt")`,
  `alter table "TikTokPublishEvent" enable row level security`,
  `drop policy if exists "TikTokPublishEvent_tenant" on "TikTokPublishEvent"`,
  `create policy "TikTokPublishEvent_tenant" on "TikTokPublishEvent"
  for all
  using (
    ("organizationId")::text = current_setting('app.organization_id', true)
    and public.app_is_org_member(current_setting('app.organization_id', true))
  )
  with check (
    ("organizationId")::text = current_setting('app.organization_id', true)
    and public.app_is_org_member(current_setting('app.organization_id', true))
  )`,
  `grant select, insert, update, delete on "TikTokPublishEvent" to zooka_runtime`,
];
