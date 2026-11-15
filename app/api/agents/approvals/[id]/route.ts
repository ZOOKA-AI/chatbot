import { decideApproval } from "@/lib/agents/command-center";
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

/**
 * Deciding an approval is a human action.
 *
 * `canManage` admits only an owner/admin session, so an agent key cannot decide
 * anything, including its own request. The write itself is one conditional
 * UPDATE scoped to the caller's organisation and to `status = 'pending'`, so a
 * second decision, or a decision on another tenant's approval, changes no row.
 */
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
    z
      .object({
        decision: z.enum(["approved", "rejected"]),
        note: z.string().trim().max(2000).optional(),
      })
      .strict()
  );
  if (!parsed.ok) {
    return badRequest(parsed.reason);
  }

  const approval = await decideApproval({
    organizationId: callerOrganizationId(caller),
    approvalId: parsedId.data,
    decision: parsed.data.decision,
    decidedBy: `owner:${caller.userId.slice(0, 8)}`,
  });

  if (!approval) {
    // Same answer for "not yours", "already decided" and "does not exist", so
    // the endpoint cannot be used to probe another tenant's approvals.
    return json({ error: "not_found" }, 404);
  }

  return json({ approval });
}
