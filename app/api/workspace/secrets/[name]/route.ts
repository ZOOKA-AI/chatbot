import { getWorkspaceContext } from "@/lib/auth/workspace";
import { withRequestTenantHandler } from "@/lib/db/request-tenant";
import { deleteWorkspaceSecret, getWorkspaceSecretMetadata, rotateWorkspaceSecret } from "@/lib/db/workspace-secrets";
import { validateJson, validateParam } from "@/lib/validation/api";
import { rotateSecretBody, secretName } from "@/lib/workspace/secrets/validation";

type Params = { params: Promise<{ name: string }> };

function reply(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

async function GETHandler(_request: Request, context: Params) {
  const workspace = await getWorkspaceContext();
  if (!workspace) return reply({ error: "unauthorized" }, 401);
  if (workspace.role !== "owner" && workspace.role !== "admin") return reply({ error: "forbidden" }, 403);
  const name = validateParam((await context.params).name, secretName, "name");
  if (!name.ok) return reply({ error: "invalid_path" }, 400);
  const secret = await getWorkspaceSecretMetadata(workspace.organizationId, name.data);
  return secret ? reply({ secret }) : reply({ error: "not_found" }, 404);
}

async function PATCHHandler(request: Request, context: Params) {
  const workspace = await getWorkspaceContext();
  if (!workspace) return reply({ error: "unauthorized" }, 401);
  if (workspace.role !== "owner" && workspace.role !== "admin") return reply({ error: "forbidden" }, 403);
  const name = validateParam((await context.params).name, secretName, "name");
  if (!name.ok) return reply({ error: "invalid_path" }, 400);
  const parsed = await validateJson(request, rotateSecretBody);
  if (!parsed.ok) return reply({ error: "invalid_body", reason: parsed.reason }, 400);
  const secret = await rotateWorkspaceSecret(workspace.organizationId, name.data, parsed.data.value);
  return secret ? reply({ secret }) : reply({ error: "not_found" }, 404);
}

async function DELETEHandler(_request: Request, context: Params) {
  const workspace = await getWorkspaceContext();
  if (!workspace) return reply({ error: "unauthorized" }, 401);
  if (workspace.role !== "owner" && workspace.role !== "admin") return reply({ error: "forbidden" }, 403);
  const name = validateParam((await context.params).name, secretName, "name");
  if (!name.ok) return reply({ error: "invalid_path" }, 400);
  const removed = await deleteWorkspaceSecret(workspace.organizationId, name.data);
  return removed ? reply({ ok: true }) : reply({ error: "not_found" }, 404);
}

export const GET = withRequestTenantHandler(GETHandler);
export const PATCH = withRequestTenantHandler(PATCHHandler);
export const DELETE = withRequestTenantHandler(DELETEHandler);
