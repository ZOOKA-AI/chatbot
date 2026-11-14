import { and, count, desc, eq, gte, lte } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { db } from "@/lib/db/queries";
import { mediaJob, studioProject, usageEvent } from "@/lib/db/schema";

const reply = (data: unknown, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
export async function GET(request: Request) {
  try {
    const context = await getWorkspaceContext();
    if (!context || context.user.type !== "regular") {
      return reply({ error: "SIGN_IN_REQUIRED" }, 401);
    }
    const params = new URL(request.url).searchParams;
    const days = z.coerce
      .number()
      .int()
      .min(1)
      .max(90)
      .safeParse(params.get("days") ?? 7);
    if (!days.success) {
      return reply({ error: "INVALID_DATE_WINDOW" }, 400);
    }
    const until = new Date();
    const since = new Date(until.getTime() - days.data * 86_400_000);
    const [media, projects, usage, recent] = await Promise.all([
      db
        .select({
          status: mediaJob.status,
          type: mediaJob.actionType,
          count: count(),
        })
        .from(mediaJob)
        .where(
          and(
            eq(mediaJob.organizationId, context.organizationId),
            gte(mediaJob.createdAt, since),
            lte(mediaJob.createdAt, until)
          )
        )
        .groupBy(mediaJob.status, mediaJob.actionType),
      db
        .select({ count: count() })
        .from(studioProject)
        .where(
          and(
            eq(studioProject.organizationId, context.organizationId),
            gte(studioProject.updatedAt, since),
            lte(studioProject.updatedAt, until)
          )
        ),
      db
        .select({ event: usageEvent.event, count: count() })
        .from(usageEvent)
        .where(
          and(
            eq(usageEvent.organizationId, context.organizationId),
            gte(usageEvent.createdAt, since),
            lte(usageEvent.createdAt, until)
          )
        )
        .groupBy(usageEvent.event),
      db
        .select({
          id: mediaJob.id,
          type: mediaJob.actionType,
          status: mediaJob.status,
          createdAt: mediaJob.createdAt,
        })
        .from(mediaJob)
        .where(
          and(
            eq(mediaJob.organizationId, context.organizationId),
            gte(mediaJob.createdAt, since),
            lte(mediaJob.createdAt, until)
          )
        )
        .orderBy(desc(mediaJob.createdAt))
        .limit(50),
    ]);
    return reply({
      window: { since: since.toISOString(), until: until.toISOString() },
      media,
      projects: projects[0]?.count ?? 0,
      usage,
      recent,
      estimatedCost: null,
      storageBytes: null,
      scope: "workspace",
      costNote:
        "No verified per-job cost or storage ledger. Unavailable is not zero.",
    });
  } catch {
    return reply({ error: "WORKSPACE_DATABASE_UNAVAILABLE" }, 503);
  }
}
