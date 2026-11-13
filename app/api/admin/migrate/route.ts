import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db, appendAgentMessage } from "@/lib/db/queries";

const TABLES: Record<string, string[]> = {
  WebhookEvent: [
    'CREATE TABLE IF NOT EXISTS "WebhookEvent" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "provider" varchar(32) NOT NULL, "externalId" text NOT NULL, "receivedAt" timestamp DEFAULT now() NOT NULL)',
    'CREATE UNIQUE INDEX IF NOT EXISTS "WebhookEvent_provider_externalId_idx" ON "WebhookEvent" ("provider", "externalId")',
  ],
  MediaJob: [
    'CREATE TABLE IF NOT EXISTS "MediaJob" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "organizationId" uuid NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE, "actionType" varchar(16) NOT NULL, "prompt" text NOT NULL, "status" varchar(16) DEFAULT \'queued\' NOT NULL, "assetUrl" text, "error" text, "createdAt" timestamp DEFAULT now() NOT NULL, "updatedAt" timestamp DEFAULT now() NOT NULL)',
    'CREATE INDEX IF NOT EXISTS "MediaJob_organizationId_createdAt_idx" ON "MediaJob" ("organizationId", "createdAt")',
  ],
  WebhookEvent_drift_0020: [
    'ALTER TABLE "WebhookEvent" ADD COLUMN IF NOT EXISTS "payload" json',
    `DO $$ BEGIN
 LOCK TABLE "WebhookEvent" IN ACCESS EXCLUSIVE MODE;
 IF EXISTS (SELECT 1 FROM "WebhookEvent" WHERE length("externalId") > 255) THEN
  RAISE EXCEPTION 'WebhookEvent externalId exceeds 255 characters' USING ERRCODE = '22001';
 END IF;
 ALTER TABLE "WebhookEvent" ALTER COLUMN "externalId" TYPE varchar(255);
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
  if (!(expected && given && expected === given)) {
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
      (select count(*) from "AgentMessage" where "createdAt" > now() - interval '2 days') as agent_msgs_48h`
  )) as unknown as Record<string, string>[];

  const url = new URL(request.url);
  if (url.searchParams.get("diag") === "append") {
    const out: Record<string, unknown> = {};
    try {
      const org = await db.execute(sql`select "id" from "Organization" limit 1`);
      const orgId = (org as unknown as { id: string }[])[0]?.id;
      await appendAgentMessage({
        organizationId: orgId as string,
        userId: orgId as string,
        conversationKey: "diag:append",
        role: "user",
        content: "drizzle append probe",
      });
      out.append = "ok";
    } catch (e) {
      out.append = "failed";
      out.error = String((e as Error).message ?? e);
    }
    return NextResponse.json({ diag: out });
  }

  
  if (url.searchParams.get("diag") === "agent") {
    const out: Record<string, unknown> = {};
    try {
      const cols = await db.execute(
        sql`select column_name, data_type, is_nullable from information_schema.columns where table_name = 'AgentMessage' order by ordinal_position`
      );
      out.columns = cols;
    } catch (e) {
      out.columns_error = String(e);
    }
    try {
      const r = await db.execute(
        sql`insert into "AgentMessage" ("organizationId", "userId", "conversationKey", "role", "content")
            select "id", "id", 'diag:probe', 'user', 'diagnostic probe' from "Organization" limit 1 returning "id", "createdAt"`
      );
      out.insert = "ok";
      out.row = r;
    } catch (e) {
      out.insert = "failed";
      out.insert_error = String((e as Error).message ?? e);
    }
    try {
      const cnt = await db.execute(sql`select count(*)::int as n from "AgentMessage"`);
      out.count = cnt;
    } catch (e) {
      out.count_error = String(e);
    }
    return NextResponse.json({ diag: out });
  }

  return NextResponse.json({
    security_stats: securityStats,
    applied,
    failed,
    tables: rows.map((row) => row.table_name),
    webhook_event_columns: webhookEventColumns,
  });
}
