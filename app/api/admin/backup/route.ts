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

export async function GET(request: Request) {
  // Constant-time comparison: a plain `!==` leaks how many leading characters
  // matched, which helps an attacker guess the token byte by byte.
  if (
    !verifySharedSecret(
      request.headers.get("x-backup-token"),
      process.env.BACKUP_TOKEN
    )
  ) {
    return NextResponse.json(
      { error: "unauthorized" },
      {
        status: 401,
        // A credential dump must never be stored by a shared cache or indexed.
        headers: {
          "cache-control": "no-store, no-cache, must-revalidate, private",
          "x-robots-tag": "noindex, nofollow",
        },
      }
    );
  }

  if (!(process.env.DATABASE_URL ?? process.env.POSTGRES_URL)) {
    return NextResponse.json({ error: "db_not_configured" }, { status: 500 });
  }

  const client = postgres(
    (process.env.DATABASE_URL ?? process.env.POSTGRES_URL) as string,
    { max: 1, prepare: false },
  );
  try {
    const tables: Record<string, unknown[]> = {};
    for (const table of TABLES) {
      const rows = await client.unsafe(`SELECT * FROM "${table}"`);
      tables[table] = rows;
    }
    return NextResponse.json(
      {
        generatedAt: new Date().toISOString(),
        tables,
      },
      {
        headers: {
          "cache-control": "no-store, no-cache, must-revalidate, private",
          "x-robots-tag": "noindex, nofollow",
        },
      }
    );
  } catch (error) {
    console.error("[admin/backup] dump failed", String(error).slice(0, 300));
    return NextResponse.json(
      // Internal driver messages can name tables, hosts and users; keep the
      // response generic and the detail in the server log only.
      { error: "backup_failed" },
      { status: 500 }
    );
  } finally {
    await client.end();
  }
}
