import { z } from "zod";

import { authenticateAgent, listTasks } from "@/lib/agents/command-center";
import { withCommanderTenant } from "@/lib/agents/commander-scope";
import { executionReport, runTask } from "@/lib/agents/worker";
import { validateJson } from "@/lib/validation/api";

export const maxDuration = 60;

const bodySchema = z
  .object({
    taskId: z.string().uuid().optional(),
    tool: z.literal("github_repo_inspect"),
    payload: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

function reply(body: unknown, status: number) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Runs at most one task per call.
 *
 * An agent key authenticates the caller, and the organisation comes from that
 * key's identity, never from the body. Omitting `taskId` takes the oldest pending
 * task in the caller's own workspace, so a scheduler can simply call this.
 */
async function POSTHandler(request: Request) {
  const agent = await authenticateAgent(request);
  if (!agent) return reply({ error: "unauthorized" }, 401);

  const parsed = await validateJson(request, bodySchema);
  if (!parsed.ok) return reply({ error: "invalid_body", detail: parsed.detail }, 400);

  let taskId = parsed.data.taskId;
  if (!taskId) {
    const pending = await listTasks({
      organizationId: agent.organizationId,
      status: "pending",
      limit: 1,
    });
    const next = pending[0];
    if (!next) return reply({ ok: true, ran: false, reason: "queue_empty" }, 200);
    taskId = next.id;
  }

  const outcome = await runTask(agent as never, {
    taskId,
    tool: parsed.data.tool,
    payload: parsed.data.payload,
  });

  return reply(
    {
      ok: outcome.ok,
      outcome,
      execution: await executionReport(agent.organizationId, taskId),
    },
    outcome.ok ? 200 : 409
  );
}

export const POST = withCommanderTenant(POSTHandler);
