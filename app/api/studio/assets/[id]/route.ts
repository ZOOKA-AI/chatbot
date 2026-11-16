import { callerOrganizationId, json, resolveCaller, unauthorized } from "@/lib/agents/auth";
import { withCommanderTenant } from "@/lib/agents/commander-scope";
import { deleteAsset, StudioError } from "@/lib/studio/media";

async function DELETEHandler(request: Request, context: { params: Promise<{ id: string }> }) {
  const caller = await resolveCaller(request);
  if (!caller || caller.kind !== "owner") return unauthorized();
  const { id } = await context.params;
  try {
    await deleteAsset(callerOrganizationId(caller), id);
    return json({ deleted: true });
  } catch (error) {
    if (error instanceof StudioError) return json({ error: error.code }, 404);
    return json({ error: "delete_failed" }, 500);
  }
}

export const DELETE = withCommanderTenant(DELETEHandler);
