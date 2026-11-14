import { hasScope, listDeployments, recordDeployment } from "@/lib/agents/command-center";
import { badRequest, forbidden, json, resolveCaller, unauthorized } from "@/lib/agents/auth";

export async function GET(request: Request) {
  const caller = await resolveCaller(request);
  if (!caller) {
    return unauthorized();
  }
  const limit = Number(new URL(request.url).searchParams.get("limit") ?? 50);
  return json({ deployments: await listDeployments(Number.isFinite(limit) ? limit : 50) });
}

export async function POST(request: Request) {
  const caller = await resolveCaller(request);
  if (!caller) {
    return unauthorized();
  }
  if (caller.kind !== "agent") {
    return forbidden("agent_key_required");
  }
  if (!hasScope(caller.agent, "deployment:write")) {
    return forbidden("missing_scope:deployment:write");
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return badRequest("invalid_json");
  }

  const deployment = await recordDeployment(caller.agent, {
    environment: typeof payload.environment === "string" ? payload.environment : "production",
    commitSha: typeof payload.commitSha === "string" ? payload.commitSha : null,
    deploymentId: typeof payload.deploymentId === "string" ? payload.deploymentId : null,
    status: typeof payload.status === "string" ? payload.status : "pending",
    notes: typeof payload.notes === "string" ? payload.notes : null,
    rollbackOf: typeof payload.rollbackOf === "string" ? payload.rollbackOf : null,
  });

  return json({ deployment }, 201);
}
