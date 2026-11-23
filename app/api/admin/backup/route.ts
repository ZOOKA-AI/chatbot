// Administrative export and disaster-recovery backup.
//
// Two exports, never confused with each other:
//
//   GET /api/admin/backup                    → the full, restore-ready backup.
//     Byte-for-byte the same row data as before this change, so an existing
//     restore procedure keeps working. Marked restoreReady: true.
//
//   GET /api/admin/backup?mode=redacted      → an administrative export for
//     sharing or inspection. Credential-shaped columns are replaced with
//     "[redacted]" and the payload is marked restoreReady: false with
//     exportType "redacted", so nobody can mistake it for a restorable dump.
//
// Both are `private, no-store`: a credential dump must never be stored by a
// shared cache, indexed, or kept in a browser.
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import postgres from "postgres";
import { mergeTableList, missingCoreTables } from "@/lib/admin/backup-tables";
import { verifySharedSecret } from "@/lib/webhooks/security";

// The table list is discovered from the database at run time; see
// lib/admin/backup-tables.ts for why a hardcoded list is not enough.

const NO_STORE = {
  "cache-control": "private, no-store, max-age=0, must-revalidate",
  pragma: "no-cache",
  "x-robots-tag": "noindex, nofollow",
} as const;

/**
 * Password hashes, session tokens and API keys are removed by column name, so a
 * future secret column is covered without editing this pattern.
 */
const SENSITIVE_COLUMN = /(password|passwd|hash|salt|secret|token|api[-_]?key)/i;

export function redactRow(row: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    clean[key] = SENSITIVE_COLUMN.test(key) ? "[redacted]" : value;
  }
  return clean;
}

/**
 * One line per refused request. The token is never logged, not even truncated:
 * a prefix plus a timestamp is still a guessing aid. The request id is echoed to
 * the caller so a support question can be matched to a log line without either
 * side handling the secret.
 */
function logRefusal(requestId: string, status: number, reason: string) {
  console.warn(
    JSON.stringify({
      ts: new Date().toISOString(),
      route: "/api/admin/backup",
      result: "refused",
      status,
      reason,
      requestId,
    })
  );
}

export async function GET(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  const headers = { ...NO_STORE, "x-request-id": requestId };
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") === "redacted" ? "redacted" : "full";

  // Constant-time comparison: a plain `!==` leaks how many leading characters
  // matched, which helps an attacker guess the token byte by byte.
  if (
    !verifySharedSecret(
      request.headers.get("x-backup-token"),
      process.env.BACKUP_TOKEN
    )
  ) {
    logRefusal(requestId, 401, request.headers.get("x-backup-token") ? "bad_token" : "no_token");
    return NextResponse.json({ error: "unauthorized", requestId }, { status: 401, headers });
  }

  // A dump needs a privileged connection: the tenant runtime role sees nothing
  // without a tenant context, and an empty "successful" backup is worse than an
  // error. Prefer the service connection, and refuse when enforcement is on and
  // no service connection is configured, instead of silently exporting zero rows.
  const connectionString =
    process.env.DATABASE_URL_SERVICE ?? process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!connectionString) {
    logRefusal(requestId, 500, "db_not_configured");
    return NextResponse.json({ error: "db_not_configured", requestId }, { status: 500, headers });
  }
  if (process.env.TENANT_RLS_ENABLED === "on" && !process.env.DATABASE_URL_SERVICE) {
    logRefusal(requestId, 500, "service_connection_required");
    return NextResponse.json(
      { error: "service_connection_required", requestId },
      { status: 500, headers }
    );
  }

  const client = postgres(connectionString, { max: 1, prepare: false });
  try {
    // Discover every base table in the public schema so a table added after
    // this file was written is still backed up. A discovery failure must not
    // silently shrink the backup: it falls back to the core list and says so.
    let discovered: string[] = [];
    let discoveryFailed = false;
    try {
      const rows = await client.unsafe(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
      );
      discovered = rows.map((row) => String((row as unknown as { table_name: unknown }).table_name));
    } catch (error) {
      discoveryFailed = true;
      console.error("[admin/backup] table discovery failed", String(error).slice(0, 200));
    }
    const tableList = mergeTableList(discovered);

    const tables: Record<string, unknown[]> = {};
    for (const table of tableList) {
      const rows = await client.unsafe(`SELECT * FROM "${table}"`);
      tables[table] =
        mode === "redacted"
          ? rows.map((row) => redactRow(row as Record<string, unknown>))
          : rows;
    }
    const rowCount = Object.values(tables).reduce((total, rows) => total + rows.length, 0);
    return NextResponse.json(
      {
        exportType: mode,
        // The whole point of this flag: a redacted export cannot restore
        // accounts, so it must never be treated as a backup.
        restoreReady: mode === "full",
        generatedAt: new Date().toISOString(),
        requestId,
        rowCount,
        tableCount: tableList.length,
        tableDiscovery: discoveryFailed ? "failed" : "ok",
        missingCoreTables: missingCoreTables(discovered),
        tables,
      },
      { headers }
    );
  } catch (error) {
    // The driver message names hosts, roles and tables. Log it, never return it.
    console.error("[admin/backup] dump failed", String(error).slice(0, 300));
    logRefusal(requestId, 500, "backup_failed");
    return NextResponse.json({ error: "backup_failed", requestId }, { status: 500, headers });
  } finally {
    await client.end();
  }
}
