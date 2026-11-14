import "server-only";

import { getWorkspaceContext } from "@/lib/auth/workspace";
import { type AgentIdentity, authenticateAgent } from "@/lib/agents/command-center";

/**
 * A caller is either an agent (bearer key) or a signed-in workspace owner.
 * Human sessions may read everything and create tasks; agents are limited to
 * their granted scopes.
 */
export type Caller =
  | { kind: "agent"; agent: AgentIdentity }
  | { kind: "owner"; userId: string; organizationId: string; role: string };

export async function resolveCaller(request: Request): Promise<Caller | null> {
  const agent = await authenticateAgent(request);
  if (agent) {
    return { kind: "agent", agent };
  }

  const context = await getWorkspaceContext();
  if (!context) {
    return null;
  }

  return {
    kind: "owner",
    userId: context.user.id,
    organizationId: context.organizationId,
    role: context.role,
  };
}

export function canManage(
  caller: Caller
): caller is Extract<Caller, { kind: "owner" }> {
  return caller.kind === "owner" && (caller.role === "owner" || caller.role === "admin");
}

export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export function unauthorized() {
  return json({ error: "unauthorized" }, 401);
}

export function forbidden(reason: string) {
  return json({ error: "forbidden", reason }, 403);
}

export function badRequest(reason: string) {
  return json({ error: "bad_request", reason }, 400);
}
