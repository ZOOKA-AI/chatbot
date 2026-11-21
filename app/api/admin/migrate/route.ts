import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/queries";
import { TIKTOK_DDL } from "@/lib/integrations/tiktok/ddl";
import { PLATFORM_ROLES_DDL } from "@/lib/platform/ddl";
import { MAIL_DDL } from "@/lib/mail/ddl";

const TABLES: Record<string, string[]> = {
  // Platform administration (migration 0063). Without this entry the tables that
  // decide who may open /admin were never created by the only migration path
  // production has, so every platform administrator was refused.
  platform_roles_0063: PLATFORM_ROLES_DDL,
  // TikTok per-creator integration (migration 0063). Same statements as
  // lib/db/migrations/pending/0064_tiktok_integration.sql; a unit test keeps
  // them equal. Two tables only, both owner-scoped by (organizationId, userId).
  tiktok_integration_0064: TIKTOK_DDL,
  // ZOOKA Mail (migration 0060). Same statements as
  // lib/db/migrations/pending/0060_zooka_mail.sql; a unit test keeps them equal.
  zooka_mail_0060: MAIL_DDL,
  // Mail and rewards tenant isolation (migration 0061). Same statements as
  // lib/db/migrations/pending/0061_mail_ledger_tenant_policies.sql; a unit test
  // keeps them equal. 0058 could not grant these tables because 0060 creates
  // them afterwards, so as zooka_runtime every read and write failed 42501.
  // Tenant policies require a real membership for the authenticated subject
  // (migration 0062). Same statements as
  // lib/db/migrations/pending/0062_policy_subject_membership.sql; a unit test
  // keeps them equal. Without the guard, a forged app.organization_id reads
  // another workspace: measured 1 row before, 0 after.
  policy_subject_membership_0062: [
    `create or replace function public.app_tenant_subject() returns text
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
    nullif(current_setting('request.jwt.claim.sub', true), '')
  )
$$`,
    `create or replace function public.app_is_org_member(org text) returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select case
    when org is null or org = '' then false
    when public.app_tenant_subject() is null then true
    else exists (
      select 1
      from public."OrganizationMember" m
      where m."organizationId"::text = org
        and m."userId"::text = public.app_tenant_subject()
    )
  end
$$`,
    `do $$
declare
  p record;
  guard text := 'public.app_is_org_member(current_setting(''app.organization_id''::text, true))';
  new_qual text;
  new_check text;
begin
  for p in
    select schemaname, tablename, policyname, cmd, roles, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and qual like '%app.organization_id%'
  loop
    new_qual := format('(%s) and %s', p.qual, guard);
    new_check := case when p.with_check is null then null else format('(%s) and %s', p.with_check, guard) end;
    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    if p.cmd = 'ALL' then
      execute format('create policy %I on %I.%I for all to %s using (%s) with check (%s)',
        p.policyname, p.schemaname, p.tablename, array_to_string(p.roles, ', '), new_qual, coalesce(new_check, new_qual));
    elsif p.cmd = 'SELECT' then
      execute format('create policy %I on %I.%I for select to %s using (%s)',
        p.policyname, p.schemaname, p.tablename, array_to_string(p.roles, ', '), new_qual);
    elsif p.cmd = 'INSERT' then
      execute format('create policy %I on %I.%I for insert to %s with check (%s)',
        p.policyname, p.schemaname, p.tablename, array_to_string(p.roles, ', '), coalesce(new_check, new_qual));
    elsif p.cmd = 'UPDATE' then
      execute format('create policy %I on %I.%I for update to %s using (%s) with check (%s)',
        p.policyname, p.schemaname, p.tablename, array_to_string(p.roles, ', '), new_qual, coalesce(new_check, new_qual));
    elsif p.cmd = 'DELETE' then
      execute format('create policy %I on %I.%I for delete to %s using (%s)',
        p.policyname, p.schemaname, p.tablename, array_to_string(p.roles, ', '), new_qual);
    end if;
  end loop;
end $$`,
  ],
  mail_ledger_tenant_policies_0061: [
    `DO $$
DECLARE
  target text;
  candidates text[] := array['MailAddress','MailMessage','MailDraft','MailAttachment','MailAudit','RewardLedger'];
BEGIN
  FOREACH target IN ARRAY candidates LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = target AND column_name = 'organizationId'
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target);
      EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', target);
      EXECUTE format(
        'CREATE POLICY tenant_isolation ON public.%I FOR ALL '
        'USING (("organizationId")::text = current_setting(''app.organization_id''::text, true)) '
        'WITH CHECK (("organizationId")::text = current_setting(''app.organization_id''::text, true))',
        target
      );
    END IF;
  END LOOP;
END $$`,
    `DO $$
DECLARE
  target text;
  candidates text[] := array['MailAddress','MailMessage','MailDraft','MailAttachment','MailAudit','RewardLedger'];
BEGIN
  FOREACH target IN ARRAY candidates LOOP
    IF to_regclass(format('public.%I', target)) IS NOT NULL THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE public.%I TO zooka_runtime', target);
      IF target = 'MailAudit' THEN
        EXECUTE format('REVOKE DELETE ON TABLE public.%I FROM zooka_runtime', target);
      ELSE
        EXECUTE format('GRANT DELETE ON TABLE public.%I TO zooka_runtime', target);
      END IF;
    END IF;
  END LOOP;
  EXECUTE 'GRANT SELECT, USAGE ON ALL SEQUENCES IN SCHEMA public TO zooka_runtime';
END $$`,
  ],
  WebhookEvent: [
    'CREATE TABLE IF NOT EXISTS "WebhookEvent" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "provider" varchar(32) NOT NULL, "externalId" text NOT NULL, "receivedAt" timestamp DEFAULT now() NOT NULL)',
    'CREATE UNIQUE INDEX IF NOT EXISTS "WebhookEvent_provider_externalId_idx" ON "WebhookEvent" ("provider", "externalId")',
  ],
  MediaJob: [
    'CREATE TABLE IF NOT EXISTS "MediaJob" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "organizationId" uuid NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE, "actionType" varchar(16) NOT NULL, "prompt" text NOT NULL, "status" varchar(16) DEFAULT \'queued\' NOT NULL, "assetUrl" text, "error" text, "createdAt" timestamp DEFAULT now() NOT NULL, "updatedAt" timestamp DEFAULT now() NOT NULL)',
    'CREATE INDEX IF NOT EXISTS "MediaJob_organizationId_createdAt_idx" ON "MediaJob" ("organizationId", "createdAt")',
  ],
  BlogPost: [
    'CREATE TABLE IF NOT EXISTS "BlogPost" ("slug" text PRIMARY KEY NOT NULL, "lang" varchar(8) DEFAULT \'en\' NOT NULL, "title" text NOT NULL, "excerpt" text, "body" text NOT NULL, "keyword" text, "status" varchar(16) DEFAULT \'draft\' NOT NULL, "author" text DEFAULT \'Zooka AI\' NOT NULL, "published_at" timestamp, "created_at" timestamp DEFAULT now() NOT NULL, "updated_at" timestamp DEFAULT now() NOT NULL)',
    'CREATE INDEX IF NOT EXISTS "BlogPost_status_published_at_idx" ON "BlogPost" USING btree ("status", "published_at")',
    'ALTER TABLE "BlogPost" ENABLE ROW LEVEL SECURITY',
  ],
  WebhookEvent_drift_0020: [
    'ALTER TABLE "WebhookEvent" ADD COLUMN IF NOT EXISTS "payload" json',
    `DO $$ BEGIN
 IF EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'WebhookEvent' AND column_name = 'externalId'
   AND (data_type <> 'character varying' OR character_maximum_length IS DISTINCT FROM 255)
 ) THEN
  PERFORM set_config('lock_timeout', '5s', true);
  LOCK TABLE "WebhookEvent" IN ACCESS EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM "WebhookEvent" WHERE length("externalId") > 255) THEN
   RAISE EXCEPTION 'WebhookEvent externalId exceeds 255 characters' USING ERRCODE = '22001';
  END IF;
  ALTER TABLE "WebhookEvent" ALTER COLUMN "externalId" TYPE varchar(255);
 END IF;
END $$`,
    `DO $$ BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM pg_constraint
  WHERE conrelid = '"WebhookEvent"'::regclass
   AND conname = 'WebhookEvent_provider_externalId_key'
 ) THEN
  IF to_regclass('"WebhookEvent_provider_externalId_idx"') IS NOT NULL THEN
   ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_provider_externalId_key"
    UNIQUE USING INDEX "WebhookEvent_provider_externalId_idx";
  ELSE
   ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_provider_externalId_key"
    UNIQUE ("provider", "externalId");
  END IF;
 END IF;
END $$`,
    'CREATE INDEX IF NOT EXISTS "WebhookEvent_receivedAt_idx" ON "WebhookEvent" USING btree ("receivedAt")',
  ],
  AgentMessage: [
    'CREATE TABLE IF NOT EXISTS "AgentMessage" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "organizationId" uuid NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE, "userId" uuid NOT NULL, "conversationKey" varchar(128) NOT NULL, "role" varchar(16) NOT NULL, "content" text NOT NULL, "createdAt" timestamp DEFAULT now() NOT NULL)',
    'CREATE INDEX IF NOT EXISTS "AgentMessage_conversationKey_createdAt_idx" ON "AgentMessage" ("conversationKey", "createdAt")',
  ],
  Chat_soft_delete: [
    'ALTER TABLE "Chat" ADD COLUMN IF NOT EXISTS "deletedAt" timestamp',
    'CREATE INDEX IF NOT EXISTS "Chat_organizationId_deletedAt_idx" ON "Chat" ("organizationId", "deletedAt")',
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Chat' AND column_name = 'deletedAt') THEN RAISE EXCEPTION 'Chat.deletedAt was not created'; END IF; END $$`,
  ],
  runtime_least_privilege_guard_0057: [
`DO $$
DECLARE
  -- Tables the runtime role must never reach. Each entry answers "who reads
  -- this before a tenant context exists, or through the service connection?".
  service_only text[] := ARRAY[
    -- authentication bootstrap: read before a session, through adminDb()
    'Account', 'Session', 'VerificationToken',
    'EmailVerificationToken', 'PasswordResetToken', 'PhoneOtp',
    'EmailSuppression', 'GuestUsage',
    -- platform and operations surfaces
    'SchedulerRun', 'WebhookEvent', '_selfhost_migrations',
    -- reward and referral ledgers: lib/growth/* uses adminDb() by design
    'RewardLedger', 'GrowthSettings', 'GrowthAudit',
    'ReferralProfile', 'ReferralInvite', 'LaunchTestingClaim',
    -- legacy tables that predate schema.ts and are unused by the application
    'lead', 'price_snapshot', 'usage_counter', 'file',
    'billing_event', 'integration_audit', 'integration_provider'
  ];
  t record;
  revoked int := 0;
  violations text[] := ARRAY[]::text[];
  closed_present text[] := ARRAY[]::text[];
BEGIN
  IF to_regrole('zooka_runtime') IS NULL THEN
    RAISE NOTICE '0057: zooka_runtime absent, nothing to guard';
    RETURN;
  END IF;

  -- 1. Explicit deny boundary.
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace
      AND c.relkind = 'r'
      AND c.relname = ANY (service_only)
  LOOP
    closed_present := closed_present || t.relname;

    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM zooka_runtime',
      t.relname
    );

    IF has_table_privilege('zooka_runtime', format('public.%I', t.relname), 'SELECT')
       OR has_table_privilege('zooka_runtime', format('public.%I', t.relname), 'INSERT') THEN
      violations := violations || format('service-only table still readable: %s', t.relname);
    ELSE
      revoked := revoked + 1;
    END IF;
  END LOOP;

  -- 2. The invariants the switch to the runtime role depends on.
  IF (SELECT rolsuper FROM pg_roles WHERE rolname = 'zooka_runtime') THEN
    violations := array_append(violations, 'zooka_runtime is superuser');
  END IF;

  IF (SELECT rolbypassrls FROM pg_roles WHERE rolname = 'zooka_runtime') THEN
    violations := array_append(violations, 'zooka_runtime bypasses row level security');
  END IF;

  IF has_schema_privilege('zooka_runtime', 'public', 'CREATE') THEN
    violations := array_append(violations, 'zooka_runtime holds CREATE on schema public');
  END IF;

  -- Every table the runtime role can reach must be both gated and governed.
  FOR t IN
    SELECT c.relname, c.relrowsecurity,
           EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid) AS has_policy
    FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace
      AND c.relkind = 'r'
      AND NOT (c.relname = ANY (service_only))
      AND has_table_privilege('zooka_runtime', format('public.%I', c.relname), 'SELECT')
  LOOP
    IF NOT t.relrowsecurity THEN
      violations := violations || format('granted table without RLS: %s', t.relname);
    END IF;
    IF NOT t.has_policy THEN
      violations := violations || format('granted table without a policy: %s', t.relname);
    END IF;
  END LOOP;

  IF array_length(violations, 1) > 0 THEN
    RAISE EXCEPTION '0057 guard failed: %', array_to_string(violations, '; ');
  END IF;

  RAISE NOTICE '0057: % service-only tables closed (% present), invariants hold',
    revoked, array_length(closed_present, 1);
  RAISE NOTICE '0057: no privileges were granted; the runtime role keeps exactly the 48 tenant tables it had';
END
$$;`,
    `DO $$ BEGIN IF to_regrole('zooka_runtime') IS NULL THEN RAISE NOTICE '0057: role absent, guard skipped'; END IF; END $$`,
  ],
  security_lockdown_0022: [
    `DO $$ DECLARE r record; BEGIN FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename); END LOOP; END $$`,
    `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated`,
    `REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated`,
    `DO $$ DECLARE r record; BEGIN FOR r IN SELECT c.relname AS v FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'v' LOOP EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', r.v); END LOOP; END $$`,
  ],
};

export async function POST(request: Request) {
  const expected = process.env.MIGRATION_TOKEN;
  const given = request.headers.get("x-migration-token");
  const tokenMatches =
    Boolean(expected && given) &&
    Buffer.byteLength(expected as string) === Buffer.byteLength(given as string) &&
    timingSafeEqual(Buffer.from(expected as string), Buffer.from(given as string));
  if (!tokenMatches) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const applied: string[] = [];
  const failed: Record<string, string> = {};

  for (const [name, statements] of Object.entries(TABLES)) {
    try {
      for (const statement of statements) {
        await db.execute(sql.raw(statement));
      }
      applied.push(name);
    } catch (error) {
      failed[name] = error instanceof Error ? error.message : String(error);
    }
  }

  const rows = (await db.execute(
    sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`
  )) as unknown as { table_name: string }[];

  const webhookEventColumns = (await db.execute(
    sql`select column_name, data_type, character_maximum_length from information_schema.columns where table_name = 'WebhookEvent' order by column_name`
  )) as unknown as {
    column_name: string;
    data_type: string;
    character_maximum_length: number | null;
  }[];

  const securityStats = (await db.execute(
    sql`select
      (select count(*) from pg_tables where schemaname = 'public' and rowsecurity) as rls_on,
      (select count(*) from pg_tables where schemaname = 'public' and not rowsecurity) as rls_off,
      (select count(*) from "Document" where "embedding" is not null) as doc_embeddings,
      (select count(*) from "AgentMessage") as agent_msgs,
      (select count(*) from "UsageEvent" where event = 'agent_run') as agent_runs,
      (select count(*) from "UsageEvent") as usage_total,
      (select count(*) from "AgentMessage" where "createdAt" > now() - interval '2 days') as agent_msgs_48h,
      (select count(*) from information_schema.role_table_grants where grantee = 'zooka_runtime') as runtime_grants,
      (select count(distinct table_name) from information_schema.role_table_grants where grantee = 'zooka_runtime' and privilege_type = 'SELECT') as runtime_select_tables,
      (select rolbypassrls from pg_roles where rolname = 'zooka_runtime') as runtime_bypassrls,
      (select has_schema_privilege('zooka_runtime', 'public', 'CREATE') from (select 1) x) as runtime_create_on_public`
  )) as unknown as Record<string, string>[];

  return NextResponse.json({
    security_stats: securityStats,
    applied,
    failed,
    tables: rows.map((row) => row.table_name),
    webhook_event_columns: webhookEventColumns,
  });
}
