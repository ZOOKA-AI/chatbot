import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/queries";
import { MAIL_DDL } from "@/lib/mail/ddl";

const TABLES: Record<string, string[]> = {
  // ZOOKA Mail (migration 0059). Same statements as
  // lib/db/migrations/pending/0059_zooka_mail.sql; a unit test keeps them equal.
  zooka_mail_0059: MAIL_DDL,
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
