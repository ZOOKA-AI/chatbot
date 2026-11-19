import { sql } from "drizzle-orm";

export interface MediaJobUpdate {
  id: string;
  status: "running" | "succeeded" | "failed";
  assetUrl?: string | null;
  error?: string | null;
}

// The condition and write run in one SQL statement: no read-then-write race.
// Completed jobs are immutable, including callbacks arriving after a retry.
export function mediaJobUpdateQuery(input: MediaJobUpdate) {
  return sql`
    UPDATE "MediaJob"
    SET "status" = ${input.status},
        "assetUrl" = ${input.status === "succeeded" ? (input.assetUrl ?? null) : null},
        "error" = ${input.status === "failed" ? (input.error ?? null) : null},
        "updatedAt" = now()
    WHERE "id" = ${input.id}::uuid
      AND "status" IN ('queued', 'running')
      AND (${input.status} != 'running' OR "status" = 'queued')
    RETURNING "id", "status"
  `;
}
