import { and, eq, gte, lt, sql } from "drizzle-orm";

import { db } from "@/lib/db/queries";
import * as schema from "@/lib/db/schema";

/**
 * The spend book.
 *
 * Two rules make this auditable instead of decorative:
 *
 * 1. Append-only. A reservation, the settlement that follows it and any late correction are three
 *    rows. History is never rewritten to make a number look better, so "why does this cost that"
 *    always has an answer.
 * 2. One row per (workspace, requestId, kind), enforced by the database. A retried webhook or a
 *    duplicated callback cannot bill the same call twice.
 *
 * Nothing here stores prompt text, raw cache keys or provider credentials: an identifier, a version
 * and a hash reproduce the decision without putting customer content in an accounting table.
 *
 * Money: numeric(18,9) in the database, integer micro-dollars in code. No float arithmetic on a bill.
 */

export const MICROS_PER_USD = 1_000_000;

export type UsageKind = "reserve" | "settle" | "adjust";

export type UsageRecord = {
  organizationId: string;
  userId?: string | null;
  taskId?: string | null;
  stepId?: string | null;
  kind: UsageKind;
  status?: string;
  provider: string;
  model: string;
  promptId?: string | null;
  promptVersion?: string | null;
  promptHash?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  cached?: boolean;
  cacheKeyHash?: string | null;
  costUsd: number;
  latencyMs?: number | null;
  requestId: string;
};

export class UsageLedgerError extends Error {
  constructor(readonly code: "duplicate_request" | "invalid_cost" | "invalid_request_id") {
    super(code);
    this.name = "UsageLedgerError";
  }
}

export function toMicros(usd: number): number {
  if (!Number.isFinite(usd) || usd < 0) throw new UsageLedgerError("invalid_cost");
  return Math.round(usd * MICROS_PER_USD);
}

export function fromMicros(micros: number): number {
  return micros / MICROS_PER_USD;
}

/** Cost from token counts at a published per-million-token price, in integer micro-dollars. */
export function costOfTokens(input: {
  inputTokens: number;
  outputTokens: number;
  inputPerMillion: number;
  outputPerMillion: number;
}): number {
  if (input.inputTokens < 0 || input.outputTokens < 0) throw new UsageLedgerError("invalid_cost");
  const micros =
    Math.round(input.inputTokens * input.inputPerMillion) + Math.round(input.outputTokens * input.outputPerMillion);
  return fromMicros(micros);
}

/** Append one row. Throws duplicate_request instead of silently summing into an existing row. */
export async function recordUsage(record: UsageRecord): Promise<{ id: string | null }> {
  if (!record.requestId || record.requestId.length > 128) throw new UsageLedgerError("invalid_request_id");
  const cost = fromMicros(toMicros(record.costUsd)).toFixed(9);

  const rows = await db
    .insert(schema.usageLedger)
    .values({
      organizationId: record.organizationId,
      userId: record.userId ?? null,
      taskId: record.taskId ?? null,
      stepId: record.stepId ?? null,
      kind: record.kind,
      status: record.status ?? (record.kind === "reserve" ? "reserved" : "settled"),
      provider: record.provider,
      model: record.model,
      promptId: record.promptId ?? null,
      promptVersion: record.promptVersion ?? null,
      promptHash: record.promptHash ?? null,
      inputTokens: record.inputTokens ?? 0,
      outputTokens: record.outputTokens ?? 0,
      cached: record.cached ?? false,
      cacheKeyHash: record.cacheKeyHash ?? null,
      costUsd: cost,
      latencyMs: record.latencyMs ?? null,
      requestId: record.requestId,
    })
    .onConflictDoNothing()
    .returning({ id: schema.usageLedger.id });

  if (rows.length === 0) throw new UsageLedgerError("duplicate_request");
  return { id: rows[0]?.id ?? null };
}

export async function usageForRequest(organizationId: string, requestId: string) {
  return db
    .select()
    .from(schema.usageLedger)
    .where(and(eq(schema.usageLedger.organizationId, organizationId), eq(schema.usageLedger.requestId, requestId)));
}

/**
 * Actual spend in a window: settlements and corrections only.
 *
 * Reservations are excluded on purpose. They are money promised, not money spent, and counting both
 * would double the number the business reads.
 */
export async function spendSince(organizationId: string, since: Date): Promise<number> {
  const rows = await db
    .select({ total: sql<string>`coalesce(sum(${schema.usageLedger.costUsd}), 0)` })
    .from(schema.usageLedger)
    .where(
      and(
        eq(schema.usageLedger.organizationId, organizationId),
        gte(schema.usageLedger.createdAt, since),
        sql`${schema.usageLedger.kind} in ('settle','adjust')`,
      ),
    );
  return Number(rows[0]?.total ?? 0);
}

/** Money promised and not yet settled: what must be held back before admitting new work. */
export async function reservedSince(organizationId: string, since: Date): Promise<number> {
  const rows = await db
    .select({ total: sql<string>`coalesce(sum(${schema.usageLedger.costUsd}), 0)` })
    .from(schema.usageLedger)
    .where(
      and(
        eq(schema.usageLedger.organizationId, organizationId),
        gte(schema.usageLedger.createdAt, since),
        eq(schema.usageLedger.kind, "reserve"),
        // A reservation that already has its settlement no longer holds money back.
        sql`not exists (
          select 1 from "UsageLedger" settled
          where settled."organizationId" = ${schema.usageLedger.organizationId}
            and settled."requestId" = ${schema.usageLedger.requestId}
            and settled.kind in ('settle','adjust')
        )`,
      ),
    );
  return Number(rows[0]?.total ?? 0);
}

export async function tokensSince(
  organizationId: string,
  since: Date,
): Promise<{ input: number; output: number }> {
  const rows = await db
    .select({
      input: sql<string>`coalesce(sum(${schema.usageLedger.inputTokens}), 0)`,
      output: sql<string>`coalesce(sum(${schema.usageLedger.outputTokens}), 0)`,
    })
    .from(schema.usageLedger)
    .where(
      and(
        eq(schema.usageLedger.organizationId, organizationId),
        gte(schema.usageLedger.createdAt, since),
        sql`${schema.usageLedger.kind} in ('settle','adjust')`,
      ),
    );
  return { input: Number(rows[0]?.input ?? 0), output: Number(rows[0]?.output ?? 0) };
}

/**
 * Reservations made before `cutoff` that never settled: money held for work that never reported back.
 * Older-than, not newer-than: this is the reclaim list, so a wide window must find the abandoned ones.
 */
export async function expiredReservations(organizationId: string, cutoff: Date) {
  return db
    .select({
      id: schema.usageLedger.id,
      requestId: schema.usageLedger.requestId,
      costUsd: schema.usageLedger.costUsd,
      createdAt: schema.usageLedger.createdAt,
    })
    .from(schema.usageLedger)
    .where(
      and(
        eq(schema.usageLedger.organizationId, organizationId),
        eq(schema.usageLedger.kind, "reserve"),
        lt(schema.usageLedger.createdAt, cutoff),
        sql`not exists (
          select 1 from "UsageLedger" settled
          where settled."organizationId" = ${schema.usageLedger.organizationId}
            and settled."requestId" = ${schema.usageLedger.requestId}
            and settled.kind in ('settle','adjust')
        )`,
      ),
    );
}
