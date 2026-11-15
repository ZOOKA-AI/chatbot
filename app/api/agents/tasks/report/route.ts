import { z } from "zod";

import { hasScope, reportTask } from "@/lib/agents/command-center";
import { fields, validateJson } from "@/lib/validation/api";
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

  const parsed = await validateJson(
    request,
    z
      .object({
        taskId: fields.uuid,
        status: z.enum(STATUSES),
        evidence: z.string().trim().min(1).max(8000),
      })
      .strict()
  );
  if (!parsed.ok) {
    return badRequest(parsed.reason);
  }
  const { taskId, status, evidence } = parsed.data as {
    taskId: string;
    status: ReportStatus;
    evidence: string;
  };

  const task = await reportTask(caller.agent, { taskId, status, evidence });
  if (!task) {
    // One answer covers three refusals on purpose: not this agent's task, not
    // this organisation's task, and a gated task whose approval is missing or
    // rejected. The reason is never exposed to the agent.
    return json({ error: "task_not_reportable" }, 403);
  }
  return json({ task });
}
