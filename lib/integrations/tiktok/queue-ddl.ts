/**
 * DDL for the TikTok publishing queue (migration 0065).
 *
 * Kept identical to lib/db/migrations/pending/0065_tiktok_publish_jobs.sql; a
 * unit test normalises both and refuses drift, because the admin migration
 * endpoint is what production actually runs and a reviewer must be able to read
 * the change it will apply.
 *
 * The policy is the same membership guard every other tenant surface carries: a
 * grant without RLS would let one workspace read another workspace's publish
 * queue. Every statement is re-runnable, so a batch that fails partway is
 * finished by running it again rather than by hand.
 */
export const TIKTOK_QUEUE_DDL: string[] = [
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
);`,
  `create unique index if not exists "TikTokPublishJob_org_jobkey_key"
  on "TikTokPublishJob" ("organizationId", "jobKey");`,
  `create index if not exists "TikTokPublishJob_due_idx"
  on "TikTokPublishJob" ("organizationId", "status", "createdAt");`,
  `alter table "TikTokPublishJob" enable row level security;`,
  `drop policy if exists "TikTokPublishJob_tenant" on "TikTokPublishJob";`,
  `create policy "TikTokPublishJob_tenant" on "TikTokPublishJob"
  for all
  using (
    ("organizationId")::text = current_setting('app.organization_id', true)
    and public.app_is_org_member(current_setting('app.organization_id', true))
  )
  with check (
    ("organizationId")::text = current_setting('app.organization_id', true)
    and public.app_is_org_member(current_setting('app.organization_id', true))
  );`,
  `grant select, insert, update, delete on "TikTokPublishJob" to zooka_runtime;`,
  `create table if not exists "TikTokPublishEvent" (
  "id" uuid primary key default gen_random_uuid(),
  "jobId" uuid not null references "TikTokPublishJob"("id") on delete cascade,
  "organizationId" uuid not null references "Organization"("id") on delete cascade,
  "userId" uuid not null references "User"("id") on delete cascade,
  "type" varchar(32) not null,
  "detail" varchar(300),
  "createdAt" timestamp not null default now()
);`,
  `create index if not exists "TikTokPublishEvent_job_idx"
  on "TikTokPublishEvent" ("jobId", "createdAt");`,
  `alter table "TikTokPublishEvent" enable row level security;`,
  `drop policy if exists "TikTokPublishEvent_tenant" on "TikTokPublishEvent";`,
  `create policy "TikTokPublishEvent_tenant" on "TikTokPublishEvent"
  for all
  using (
    ("organizationId")::text = current_setting('app.organization_id', true)
    and public.app_is_org_member(current_setting('app.organization_id', true))
  )
  with check (
    ("organizationId")::text = current_setting('app.organization_id', true)
    and public.app_is_org_member(current_setting('app.organization_id', true))
  );`,
  `grant select, insert, update, delete on "TikTokPublishEvent" to zooka_runtime;`,
];
