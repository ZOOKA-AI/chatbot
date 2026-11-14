import { hasScope, reportTask } from "@/lib/agents/command-center";
import { badRequest, forbidden, json, resolveCaller, unauthorized } from "@/lib/agents/auth";

const STATUSES = ["completed", "failed", "blocked"] as const;
type ReportStatus = (typeof STATUSES)[number];

export async function POST(request: Request) {
  const caller = await resolveCaller(request);
  if (!caller) {
    return unauthorized();
  }
  if (caller.kind !== "agent") {
    return forbidden("agent_key_required");
  }
  if (!hasScope(caller.agent, "task:report")) {
    return forbidden("missing_scope:task:report");
  }

  let payload: { taskId?: unknown; status?: unknown; evidence?: unknown };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return badRequest("invalid_json");
  }

  const taskId = typeof payload.taskId === "string" ? payload.taskId.trim() : "";
  const status = STATUSES.includes(payload.status as ReportStatus)
    ? (payload.status as ReportStatus)
    : null;
  const evidence = typeof payload.evidence === "string" ? payload.evidence.trim() : "";

  if (!taskId || !status || !evidence) {
    return badRequest("taskId_status_evidence_required");
  }

  const task = await reportTask(caller.agent, { taskId, status, evidence });
  if (!task) {
    return json({ error: "task_not_owned_by_caller" }, 403);
  }
  return json({ task });
}
