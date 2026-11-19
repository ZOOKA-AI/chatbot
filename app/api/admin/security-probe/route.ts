import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/queries";
import { getBrowserSessions, getDevelopment } from "@/lib/admin/sections";
import { getCommandOverview } from "@/lib/admin/overview";
import type { AdminSection } from "@/lib/admin/types";

/**
 * TEMPORARY diagnostic. Delete once /admin/security renders.
 *
 * The page never finishes rendering on production: the shell and the title arrive, then the body
 * stalls, while each of its three loaders answers fine on the page that owns it alone. Runtime logs are
 * not readable from here, so this route runs the same three loaders in the same order and reports how
 * long each one took, so the stall can be attributed to a loader or ruled out of them entirely.
 *
 * Read-only, and gated by the same token as the migration route.
 */
export const maxDuration = 60;

type Step = {
  loader: string;
  ms: number;
  ok: boolean;
  timedOut: boolean;
  metrics?: number;
  tables?: number;
  rows?: number;
  error?: string;
};

function tokenMatches(request: Request): boolean {
  const expected = process.env.MIGRATION_TOKEN;
  const given = request.headers.get("x-migration-token");
  return (
    Boolean(expected && given) &&
    Buffer.byteLength(expected as string) === Buffer.byteLength(given as string) &&
    timingSafeEqual(Buffer.from(expected as string), Buffer.from(given as string))
  );
}

async function measure(
  loader: string,
  run: () => Promise<AdminSection>,
  budgetMs: number
): Promise<Step> {
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), budgetMs);
  });

  try {
    const outcome = await Promise.race([run(), timeout]);
    const ms = Date.now() - started;
    if (outcome === "timeout") {
      return { loader, ms, ok: false, timedOut: true };
    }
    return {
      loader,
      ms,
      ok: true,
      timedOut: false,
      metrics: outcome.metrics.length,
      tables: outcome.tables.length,
      rows: outcome.tables.reduce((total, table) => total + table.rows.length, 0),
    };
  } catch (error) {
    return {
      loader,
      ms: Date.now() - started,
      ok: false,
      timedOut: false,
      error: error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200),
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function GET(request: Request) {
  if (!tokenMatches(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const steps: Step[] = [];

  let organizationId: string | null = null;
  let shape = "unknown";
  try {
    const result = (await db.execute(
      sql.raw(`select "organizationId"::text as id from "OrganizationMember" limit 1`)
    )) as unknown;
    const rows = Array.isArray(result)
      ? (result as { id: string }[])
      : ((result as { rows?: { id: string }[] }).rows ?? []);
    shape = `${Array.isArray(result) ? "array" : typeof result}:${rows.length}`;
    organizationId = rows[0]?.id ?? null;
  } catch (error) {
    return NextResponse.json(
      {
        error: "organization_lookup_failed",
        shape,
        detail: error instanceof Error ? error.message.slice(0, 200) : "unknown",
      },
      { status: 500 }
    );
  }

  if (!organizationId) {
    return NextResponse.json({ error: "no_organization", shape }, { status: 409 });
  }

  // Same order the page awaits them in, so a stall shows up on the same step.
  steps.push(await measure("getCommandOverview", () => getCommandOverview(organizationId), 20000));
  steps.push(await measure("getDevelopment", () => getDevelopment(organizationId), 20000));
  steps.push(await measure("getBrowserSessions", () => getBrowserSessions(organizationId), 20000));

  return NextResponse.json(
    {
      organizationId,
      totalMs: Date.now() - startedAt,
      steps,
      stalled: steps.filter((step) => step.timedOut).map((step) => step.loader),
    },
    { headers: { "cache-control": "no-store" } }
  );
}
