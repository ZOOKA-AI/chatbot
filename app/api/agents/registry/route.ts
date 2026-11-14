import { listAgents, registerAgent } from "@/lib/agents/command-center";
import { badRequest, canManage, json, resolveCaller, unauthorized } from "@/lib/agents/auth";

export async function GET(request: Request) {
  const caller = await resolveCaller(request);
  if (!caller) {
    return unauthorized();
  }
  return json({ agents: await listAgents() });
}

/** Owner-only: registers an agent and returns its key exactly once. */
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

  const slug = typeof payload.slug === "string" ? payload.slug.trim() : "";
  const displayName = typeof payload.displayName === "string" ? payload.displayName.trim() : "";
  const role = typeof payload.role === "string" ? payload.role.trim() : "";
  if (!slug || !displayName || !role) {
    return badRequest("slug_displayName_role_required");
  }

  const scopes = Array.isArray(payload.scopes)
    ? payload.scopes.filter((scope): scope is string => typeof scope === "string")
    : undefined;
  const environment =
    payload.environment === "preview" || payload.environment === "development"
      ? payload.environment
      : "production";

  try {
    const created = await registerAgent({ slug, displayName, role, scopes, environment });
    return json({ ...created, warning: "store_this_key_now_it_is_never_returned_again" }, 201);
  } catch (error) {
    if (error instanceof Error && /duplicate key/.test(error.message)) {
      return badRequest("slug_already_registered");
    }
    throw error;
  }
}
