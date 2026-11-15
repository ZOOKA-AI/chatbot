import { cancelTask } from "@/lib/agents/command-center";
import { z } from "zod";

import {
  badRequest,
  callerOrganizationId,
  canManage,
  forbidden,
  json,
  resolveCaller,
  unauthorized,
} from "@/lib/agents/auth";
import { fields, validateJson } from "@/lib/validation/api";

/** Cancelling is a human action, like deciding an approval. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const caller = await resolveCaller(request);
  if (!caller) {
    return unauthorized();
  }
  if (!canManage(caller)) {
    return forbidden("owner_or_admin_required");
  }

  const { id } = await params;
  const parsedId = fields.uuid.safeParse(id);
  if (!parsedId.success) {
    return badRequest("invalid_body");
  }

  const parsed = await validateJson(
    request,
    z.object({ reason: fields.reason }).strict()
  );
  if (!parsed.ok) {
    return badRequest(parsed.reason);
  }

  const task = await cancelTask({
    organizationId: callerOrganizationId(caller),
    taskId: parsedId.data,
    reason: parsed.data.reason,
    by: `owner:${caller.userId.slice(0, 8)}`,
  });

  if (!task) {
    return json({ error: "not_found" }, 404);
  }
  return json({ task });
}
