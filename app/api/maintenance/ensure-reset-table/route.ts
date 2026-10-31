import { NextResponse } from "next/server";
import postgres from "postgres";

const ONETIME = "7d2e4b9a1c6f48e0b3a5d7c9e1f2a4b6";

export async function POST(request: Request) {
  if (request.headers.get("x-onetime") !== ONETIME) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const url = process.env.DATABASE_URL ?? (process.env.POSTGRES_URL as string);
  const sql = postgres(url, { max: 1, prepare: false });
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
        "tokenHash" varchar(64) PRIMARY KEY NOT NULL,
        "userId" uuid NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
        "expiresAt" timestamp NOT NULL,
        "usedAt" timestamp,
        "createdAt" timestamp NOT NULL DEFAULT now()
      )
    `;
    const rows = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'PasswordResetToken') AS exists
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
