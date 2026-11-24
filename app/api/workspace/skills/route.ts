import { json, unauthorized } from "@/lib/agents/auth";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { withRequestTenantHandler } from "@/lib/db/request-tenant";
import { createWorkspaceSkill, listWorkspaceSkills } from "@/lib/db/skills";
import { validateJson } from "@/lib/validation/api";
import { createSkillBody } from "@/lib/workspace/skills/validation";

async function GETHandler(request: Request) {
  const workspace = await getWorkspaceContext();
  if (!workspace) return unauthorized();
  const skills = await listWorkspaceSkills(workspace.organizationId);
  return json({ skills, count: skills.length });
}

async function POSTHandler(request: Request) {
  const workspace = await getWorkspaceContext();
  if (!workspace) return unauthorized();
  if (workspace.role !== "owner" && workspace.role !== "admin") return json({ error: "forbidden", reason: "owner_or_admin_required" }, 403);
  const parsed = await validateJson(request, createSkillBody);
  if (!parsed.ok) return json({ error: "invalid_body", reason: parsed.reason }, 400);
  const skill = await createWorkspaceSkill({ ...parsed.data, organizationId: workspace.organizationId, createdBy: workspace.user.id });
  if (!skill) return json({ error: "name_taken" }, 409);
  return json({ skill }, 201);
}

export const GET = withRequestTenantHandler(GETHandler);
export const POST = withRequestTenantHandler(POSTHandler);
