import { z } from "zod";

import { hasScope, reportTask } from "@/lib/agents/command-center";
import { fields, validateJson } from "@/lib/validation/api";
import { badRequest, forbidden, json, resolveCaller, unauthorized } from "@/lib/agents/auth";
import { withCommanderTenant } from "@/lib/agents/commander-scope";

const STATUSES = ["completed", "failed", "blocked"] as const;
type ReportStatus = (typeof STATUSES)[number];

async function POSTHandler(request: Request) {
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

// Runs inside the caller's tenant transaction when TENANT_RLS_ENABLED is on.
export const POST = withCommanderTenant(POSTHandler);
