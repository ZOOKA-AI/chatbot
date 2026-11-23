import { z } from "zod";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { withRequestTenantHandler } from "@/lib/db/request-tenant";
import { getWorkspaceSecretDetectionEnabled, setWorkspaceSecretDetectionEnabled } from "@/lib/db/workspace-secrets";
import { validateJson } from "@/lib/validation/api";

function reply(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

async function GETHandler(_request: Request) {
  const workspace = await getWorkspaceContext();
  if (!workspace) return reply({ error: "unauthorized" }, 401);
  if (workspace.role !== "owner" && workspace.role !== "admin") return reply({ error: "forbidden" }, 403);
  return reply({ enabled: await getWorkspaceSecretDetectionEnabled(workspace.organizationId) });
}

async function PATCHHandler(request: Request) {
  const workspace = await getWorkspaceContext();
  if (!workspace) return reply({ error: "unauthorized" }, 401);
  if (workspace.role !== "owner" && workspace.role !== "admin") return reply({ error: "forbidden" }, 403);
  const parsed = await validateJson(request, z.object({ enabled: z.boolean() }).strict());
  if (!parsed.ok) return reply({ error: "invalid_body", reason: parsed.reason }, 400);
  await setWorkspaceSecretDetectionEnabled(workspace.organizationId, parsed.data.enabled);
  return reply({ enabled: parsed.data.enabled });
}

export const GET = withRequestTenantHandler(GETHandler);
export const PATCH = withRequestTenantHandler(PATCHHandler);
