import { createTask, listTasks } from "@/lib/agents/command-center";
import {
  badRequest,
  callerOrganizationId,
  canManage,
  json,
  resolveCaller,
  unauthorized,
} from "@/lib/agents/auth";

export async function GET(request: Request) {
  const caller = await resolveCaller(request);
  if (!caller) {
    return unauthorized();
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? undefined;
  const ownerAgentId = url.searchParams.get("ownerAgentId") ?? undefined;
  const available = url.searchParams.get("available") === "true";
  const limit = Number(url.searchParams.get("limit") ?? 50);

  return json({
    tasks: await listTasks({
      organizationId: callerOrganizationId(caller),
      status,
      ownerAgentId,
      available,
      limit: Number.isFinite(limit) ? limit : 50,
    }),
  });
}

/** Owner-only: puts work into the shared queue. */
export async function POST(request: Request) {
  const caller = await resolveCaller(request);
  if (!caller) {
    return unauthorized();
  }
  if (!canManage(caller)) {
    return badRequest("owner_or_admin_required");
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return badRequest("invalid_json");
  }

  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  const instruction = typeof payload.instruction === "string" ? payload.instruction.trim() : "";
  if (!title || !instruction) {
    return badRequest("title_and_instruction_required");
  }

  const task = await createTask({
    organizationId: callerOrganizationId(caller),
    title,
    instruction,
    ownerAgentId: typeof payload.ownerAgentId === "string" ? payload.ownerAgentId : null,
    priority: ["low", "normal", "high", "critical"].includes(String(payload.priority))
      ? (payload.priority as "low" | "normal" | "high" | "critical")
      : "normal",
    dependencies: Array.isArray(payload.dependencies)
      ? payload.dependencies.filter((value): value is string => typeof value === "string")
      : [],
    environment: typeof payload.environment === "string" ? payload.environment : "production",
    approvalRequired: payload.approvalRequired === true,
    rollbackPlan: typeof payload.rollbackPlan === "string" ? payload.rollbackPlan : null,
    createdBy: `owner:${caller.userId.slice(0, 8)}`,
  });

  return json({ task }, 201);
}
