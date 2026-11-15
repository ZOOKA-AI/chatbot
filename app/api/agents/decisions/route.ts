import { hasScope, listDecisions, recordDecision } from "@/lib/agents/command-center";
import {
  badRequest,
  callerOrganizationId,
  forbidden,
  json,
  resolveCaller,
  unauthorized,
} from "@/lib/agents/auth";

export async function GET(request: Request) {
  const caller = await resolveCaller(request);
  if (!caller) {
    return unauthorized();
  }
  const limit = Number(new URL(request.url).searchParams.get("limit") ?? 50);
  return json({ decisions: await listDecisions(callerOrganizationId(caller), Number.isFinite(limit) ? limit : 50) });
}

export async function POST(request: Request) {
  const caller = await resolveCaller(request);
  if (!caller) {
    return unauthorized();
  }
  if (caller.kind === "agent" && !hasScope(caller.agent, "decision:write")) {
    return forbidden("missing_scope:decision:write");
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return badRequest("invalid_json");
  }

  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  const body = typeof payload.body === "string" ? payload.body.trim() : "";
  if (!title || !body) {
    return badRequest("title_and_body_required");
  }

  const states = ["PROPOSED", "APPROVED", "IMPLEMENTED", "VERIFIED", "DEPRECATED"];
  const state = typeof payload.state === "string" && states.includes(payload.state)
    ? payload.state
    : "PROPOSED";

  const decision = await recordDecision(caller.kind === "agent" ? caller.agent : null, {
    organizationId: callerOrganizationId(caller),
    title,
    body,
    state,
    taskId: typeof payload.taskId === "string" ? payload.taskId : null,
  });

  return json({ decision }, 201);
}
