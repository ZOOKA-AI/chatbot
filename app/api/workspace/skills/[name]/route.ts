import { json, unauthorized } from "@/lib/agents/auth";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { isUniqueViolation } from "@/lib/db/errors";
import { withRequestTenantHandler } from "@/lib/db/request-tenant";
import { deleteWorkspaceSkill, getWorkspaceSkillByName, updateWorkspaceSkill } from "@/lib/db/skills";
import { validateJson, validateParam } from "@/lib/validation/api";
import { patchSkillBody, skillName } from "@/lib/workspace/skills/validation";

type Params = { params: Promise<{ name: string }> };

async function GETHandler(request: Request, context: Params) {
  const workspace = await getWorkspaceContext();
  if (!workspace) return unauthorized();
  const name = validateParam((await context.params).name, skillName, "name");
  if (!name.ok) return json({ error: "invalid_path", reason: name.reason }, 400);
  const skill = await getWorkspaceSkillByName(workspace.organizationId, name.data);
  return skill ? json({ skill }) : json({ error: "not_found" }, 404);
}

async function PATCHHandler(request: Request, context: Params) {
  const workspace = await getWorkspaceContext();
  if (!workspace) return unauthorized();
  if (workspace.role !== "owner" && workspace.role !== "admin") return json({ error: "forbidden", reason: "owner_or_admin_required" }, 403);
  const name = validateParam((await context.params).name, skillName, "name");
  if (!name.ok) return json({ error: "invalid_path", reason: name.reason }, 400);
  const parsed = await validateJson(request, patchSkillBody);
  if (!parsed.ok) return json({ error: "invalid_body", reason: parsed.reason }, 400);
  const skill = await updateWorkspaceSkill(workspace.organizationId, name.data, parsed.data);
  return skill ? json({ skill }) : json({ error: "not_found" }, 404);
}

async function DELETEHandler(request: Request, context: Params) {
  const workspace = await getWorkspaceContext();
  if (!workspace) return unauthorized();
  if (workspace.role !== "owner" && workspace.role !== "admin") return json({ error: "forbidden", reason: "owner_or_admin_required" }, 403);
  const name = validateParam((await context.params).name, skillName, "name");
  if (!name.ok) return json({ error: "invalid_path", reason: name.reason }, 400);
  const removed = await deleteWorkspaceSkill(workspace.organizationId, name.data);
  return removed ? json({ ok: true }) : json({ error: "not_found" }, 404);
}

export const GET = withRequestTenantHandler(GETHandler);
const patchWithTenant = withRequestTenantHandler(PATCHHandler);
export async function PATCH(request: Request, context: Params) {
  try {
    return await patchWithTenant(request, context);
  } catch (error) {
    if (isUniqueViolation(error, "WorkspaceSkill_organizationId_name_key")) return json({ error: "name_taken" }, 409);
    throw error;
  }
}
export const DELETE = withRequestTenantHandler(DELETEHandler);
