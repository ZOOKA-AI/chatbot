// Full DB JSON dump, protected by BACKUP_TOKEN header check.
import { NextResponse } from "next/server";
import postgres from "postgres";
import { verifySharedSecret } from "@/lib/webhooks/security";

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

/**
 * A credential dump must never be stored by a shared cache, indexed, or kept in
 * a browser. Applied to every response of this route, including the refusals.
 */
const NO_STORE = {
  "cache-control": "private, no-store, max-age=0, must-revalidate",
  pragma: "no-cache",
  "x-robots-tag": "noindex, nofollow",
} as const;

/**
 * Password hashes, session tokens and API keys have no place in a backup that
 * leaves the database, so they are removed at the boundary rather than trusted
 * to never be read. The column name decides, not the table, so a future column
 * is covered without editing this list.
 */
const SENSITIVE_COLUMN = /(password|passwd|hash|salt|secret|token|api[-_]?key)/i;

export function redactRow(row: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    clean[key] = SENSITIVE_COLUMN.test(key) ? "[redacted]" : value;
  }
  return clean;
}

export async function GET(request: Request) {
  // Constant-time comparison: a plain `!==` leaks how many leading characters
  // matched, which helps an attacker guess the token byte by byte.
  if (
    !verifySharedSecret(
      request.headers.get("x-backup-token"),
      process.env.BACKUP_TOKEN
    )
  ) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }

  if (!(process.env.DATABASE_URL ?? process.env.POSTGRES_URL)) {
    return NextResponse.json({ error: "db_not_configured" }, { status: 500, headers: NO_STORE });
  }

  const client = postgres(
    (process.env.DATABASE_URL ?? process.env.POSTGRES_URL) as string,
    { max: 1, prepare: false },
  );
  try {
    const tables: Record<string, unknown[]> = {};
    for (const table of TABLES) {
      const rows = await client.unsafe(`SELECT * FROM "${table}"`);
      tables[table] = rows.map((row) => redactRow(row as Record<string, unknown>));
    }
    return NextResponse.json(
      { generatedAt: new Date().toISOString(), tables },
      { headers: NO_STORE }
    );
  } catch (error) {
    // The driver message names hosts, roles and tables. Log it, never return it.
    console.error("[admin/backup] dump failed", String(error).slice(0, 300));
    return NextResponse.json({ error: "backup_failed" }, { status: 500, headers: NO_STORE });
  } finally {
    await client.end();
  }
}
