import "server-only";

/**
 * Approval lifecycle for agent actions (AgentApproval, created by migration
 * 0027). The rules live here rather than in the route so they can be proven
 * against a real Postgres without a running Next server:
 *
 *  - only a `pending` approval can be decided;
 *  - a pending approval older than APPROVAL_TTL_HOURS is `expired` and can no
 *    longer be decided (a stale "yes" must never resurrect old work);
 *  - every decision is written back to the same row (status/decidedBy/decidedAt)
 *    and, when asked, mirrored into AgentDecision as the durable action log.
 *
 * The SQL executor is injected so a test can run these statements on an isolated
 * database and the app can pass drizzle's db.execute.
 */
export type SqlExecutor = (
  text: string,
  values?: unknown[]
) => Promise<Record<string, unknown>[]>;

export const APPROVAL_TTL_HOURS = 24;

export type ApprovalDecision = "approved" | "rejected";

export type DecideResult =
  | { outcome: "decided"; id: string; status: ApprovalDecision }
  | { outcome: "already_decided"; id: string; status: string }
  | { outcome: "expired"; id: string }
  | { outcome: "not_found"; id: string }
  | { outcome: "unauthorized"; reason: "decided_by_required" };

export async function decideApproval(
  exec: SqlExecutor,
  input: {
    id: string;
    decision: ApprovalDecision;
    decidedBy: string;
    now?: Date;
    log?: boolean;
  }
): Promise<DecideResult> {
  // An unattributed decision is not a decision: the audit trail must name who
  // accepted or refused, so an empty decider is refused before any read.
  const decidedBy = typeof input.decidedBy === "string" ? input.decidedBy.trim() : "";
  if (!decidedBy) {
    return { outcome: "unauthorized", reason: "decided_by_required" };
  }

  const now = input.now ?? new Date();
  const cutoff = new Date(now.getTime() - APPROVAL_TTL_HOURS * 3600_000);

  const rows = await exec(
    `select id, "taskId", status, "createdAt" from "AgentApproval" where id = $1`,
    [input.id]
  );
  const row = rows[0];
  if (!row) {
    return { outcome: "not_found", id: input.id };
  }

  const status = String(row.status ?? "");
  if (status !== "pending") {
    return { outcome: "already_decided", id: input.id, status };
  }

  const createdAt = new Date(String(row.createdAt));
  if (Number.isNaN(createdAt.getTime()) || createdAt < cutoff) {
    await exec(
      `update "AgentApproval" set status = 'expired', "decidedAt" = $2
       where id = $1 and status = 'pending'`,
      [input.id, now.toISOString()]
    );
    return { outcome: "expired", id: input.id };
  }

  const updated = await exec(
    `update "AgentApproval"
        set status = $2, "decidedBy" = $3, "decidedAt" = $4
      where id = $1 and status = 'pending'
      returning id, status`,
    [input.id, input.decision, decidedBy, now.toISOString()]
  );
  if (!updated[0]) {
    return { outcome: "already_decided", id: input.id, status: "pending" };
  }

  if (input.log !== false) {
    await exec(
      `insert into "AgentDecision" (title, body, state, "taskId")
       values ($1, $2, $3, $4)`,
      [
        `Approval ${input.decision === "approved" ? "granted" : "refused"}`,
        `Approval ${input.id} was ${input.decision} by ${decidedBy}.`,
        input.decision === "approved" ? "APPROVED" : "REJECTED",
        (row.taskId as string | null) ?? null,
      ]
    );
  }

  return { outcome: "decided", id: input.id, status: input.decision };
}

/** Marks every stale pending approval as expired. Safe to run on any cadence. */
export async function expireStaleApprovals(
  exec: SqlExecutor,
  now: Date = new Date()
) {
  const cutoff = new Date(now.getTime() - APPROVAL_TTL_HOURS * 3600_000);
  const rows = await exec(
    `update "AgentApproval" set status = 'expired', "decidedAt" = $2
      where status = 'pending' and "createdAt" < $1
      returning id`,
    [cutoff.toISOString(), now.toISOString()]
  );
  return rows.length;
}

export async function listPendingApprovals(exec: SqlExecutor, limit = 50) {
  return exec(
    `select id, "taskId", "requestedBy", reason, status, "createdAt"
       from "AgentApproval"
      where status = 'pending'
      order by "createdAt" asc
      limit $1`,
    [limit]
  );
}
