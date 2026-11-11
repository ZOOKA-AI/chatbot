import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/queries";

const STATEMENTS: Record<string, string[]> = {
  WebhookEvent: [
    `CREATE TABLE IF NOT EXISTS "WebhookEvent" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
       "provider" varchar(32) NOT NULL,
       "externalId" text NOT NULL,
       "receivedAt" timestamp DEFAULT now() NOT NULL
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "WebhookEvent_provider_externalId_idx"
       ON "WebhookEvent" ("provider", "externalId")`,
  ],
  MediaJob: [
    `CREATE TABLE IF NOT EXISTS "MediaJob" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
       "organizationId" uuid NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
       "actionType" varchar(16) NOT NULL,
       "prompt" text NOT NULL,
       "status" varchar(16) DEFAULT 'queued' NOT NULL,
       "assetUrl" text,
       "error" text,
       "createdAt" timestamp DEFAULT now() NOT NULL,
       "updatedAt" timestamp DEFAULT now() NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS "MediaJob_organizationId_createdAt_idx"
       ON "MediaJob" ("organizationId", "createdAt")`,
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

  for (const [name, statements] of Object.entries(STATEMENTS)) {
    try {
      for (const statement of statements) {
        await db.execute(sql.raw(statement));
      }
      applied.push(name);
    } catch (error) {
      failed[name] = error instanceof Error ? error.message : String(error);
    }
  }

  const existing = await db.execute(sql`
    select table_name from information_schema.tables
    where table_schema = 'public' order by table_name
  `);

  return NextResponse.json({
    applied,
    failed,
    tables: existing.rows.map((row) => (row as { table_name: string }).table_name),
  });
}
