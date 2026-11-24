import { copyAgentTemplate, getPublicAgentTemplate } from "@/lib/agents/templates";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { withCommanderScope } from "@/lib/agents/commander-scope";
import { json } from "@/lib/agents/auth";

type Params = { params: Promise<{ token: string }> };

async function GETHandler(_request: Request, context: Params) {
  const { token } = await context.params;
  const template = await getPublicAgentTemplate(token);
  if (!template) return json({ error: "not_found" }, 404);
  return json({ template });
}

async function POSTHandler(_request: Request, context: Params) {
  const workspace = await getWorkspaceContext();
  if (!workspace || workspace.user.type === "guest") return json({ error: "unauthorized" }, 401);
  if (workspace.role !== "owner" && workspace.role !== "admin") {
    return json({ error: "forbidden", reason: "owner_or_admin_required" }, 403);
  }

  const { token } = await context.params;
  const result = await withCommanderScope(
    workspace.organizationId,
    () => copyAgentTemplate(token, workspace.organizationId),
    workspace.user.id
  );
  if (!result) return json({ error: "not_found" }, 404);
  return json(result, 201);
}

export const GET = GETHandler;
export const POST = POSTHandler;
