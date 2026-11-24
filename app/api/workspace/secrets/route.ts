import { getWorkspaceContext } from "@/lib/auth/workspace";
import { withRequestTenantHandler } from "@/lib/db/request-tenant";
import { createWorkspaceSecret, listWorkspaceSecrets } from "@/lib/db/workspace-secrets";
import { validateJson } from "@/lib/validation/api";
import { createSecretBody } from "@/lib/workspace/secrets/validation";

function reply(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

async function GETHandler(_request: Request) {
  const workspace = await getWorkspaceContext();
  if (!workspace) return reply({ error: "unauthorized" }, 401);
  if (workspace.role !== "owner" && workspace.role !== "admin") return reply({ error: "forbidden" }, 403);
  const secrets = await listWorkspaceSecrets(workspace.organizationId);
  return reply({ secrets, count: secrets.length });
}

async function POSTHandler(request: Request) {
  const workspace = await getWorkspaceContext();
  if (!workspace) return reply({ error: "unauthorized" }, 401);
  if (workspace.role !== "owner" && workspace.role !== "admin") return reply({ error: "forbidden" }, 403);
  const parsed = await validateJson(request, createSecretBody);
  if (!parsed.ok) return reply({ error: "invalid_body", reason: parsed.reason }, 400);
  const secret = await createWorkspaceSecret({ ...parsed.data, organizationId: workspace.organizationId, createdBy: workspace.user.id });
  return secret ? reply({ secret }, 201) : reply({ error: "name_taken" }, 409);
}

export const GET = withRequestTenantHandler(GETHandler);
export const POST = withRequestTenantHandler(POSTHandler);
