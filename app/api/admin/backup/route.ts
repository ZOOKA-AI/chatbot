import { NextResponse } from "next/server";
import postgres from "postgres";

const TABLES = [
  "User",
  "Organization",
  "OrganizationMember",
  "Invitation",
  "Subscription",
  "UsageEvent",
  "Chat",
  "Message",
  "Message_v2",
  "Vote",
  "Vote_v2",
  "Document",
  "Suggestion",
  "Stream",
] as const;

export async function GET(request: Request) {
  const token = request.headers.get("x-backup-token");
  if (!process.env.BACKUP_TOKEN || token !== process.env.BACKUP_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!process.env.POSTGRES_URL) {
    return NextResponse.json({ error: "db_not_configured" }, { status: 500 });
  }

  const client = postgres(process.env.POSTGRES_URL, { max: 1 });
  try {
    const tables: Record<string, unknown[]> = {};
    for (const table of TABLES) {
      const rows = await client.unsafe(`SELECT * FROM "${table}"`);
      tables[table] = rows;
    }
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      tables,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "backup_failed", details: String(error).slice(0, 300) },
      { status: 500 }
    );
  } finally {
    await client.end();
  }
}
