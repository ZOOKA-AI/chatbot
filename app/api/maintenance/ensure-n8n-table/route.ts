import { NextResponse } from "next/server";
import postgres from "postgres";
import {
  deleteN8nCredentials,
  getN8nCredentials,
  saveN8nCredentials,
} from "@/lib/integrations/n8n/store";

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

    // Round-trip through the real store functions so the encrypt/save/read/delete
    // path is proven, not just the DDL.
    const orgs = await sql<{ id: string }[]>`
      SELECT id FROM "Organization" ORDER BY "createdAt" ASC LIMIT 5
    `;
    let selftest: Record<string, unknown> = { skipped: "no_organization" };
    for (const org of orgs) {
      const existing = await getN8nCredentials(org.id);
      if (existing) {
        continue;
      }
      const saved = await saveN8nCredentials(org.id, {
        baseUrl: "https://selftest.invalid",
        apiKey: "selftest-key-000000000000000000",
      });
      const readBack = await getN8nCredentials(org.id);
      await deleteN8nCredentials(org.id);
      const afterDelete = await getN8nCredentials(org.id);
      selftest = {
        orgId: org.id,
        saved,
        readBackUrl: readBack?.baseUrl ?? null,
        readBackKeyMatches: readBack?.apiKey === "selftest-key-000000000000000000",
        cleanedUp: afterDelete === null,
      };
      break;
    }

    return NextResponse.json({
      ok: true,
      created: rows[0]?.exists ?? false,
      selftest,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown" },
      { status: 500 }
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}
