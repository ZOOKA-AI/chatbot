import { NextResponse } from "next/server";
import postgres from "postgres";

const ONETIME = "f3a9c1d7e2b84a6f9c05d31b7ea24c68";

/**
 * One-time schema fix: creates the N8nConnection table used by the per-workspace
 * n8n integration. Guarded by a throwaway secret and removed right after the run.
 */
export async function POST(request: Request) {
  if (request.headers.get("x-onetime") !== ONETIME) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const url =
    process.env.DATABASE_URL ?? (process.env.POSTGRES_URL as string | undefined);
  if (!url) {
    return NextResponse.json({ error: "no_database_url" }, { status: 500 });
  }
  const sql = postgres(url, { max: 1, prepare: false });
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS "N8nConnection" (
        "organizationId" uuid PRIMARY KEY NOT NULL
          REFERENCES "Organization"(id) ON DELETE CASCADE,
        "encryptedCredentials" text NOT NULL,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      )
    `;
    const rows = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'N8nConnection'
      ) AS exists
    `;
    return NextResponse.json({ ok: true, created: rows[0]?.exists ?? false });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown" },
      { status: 500 }
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}
