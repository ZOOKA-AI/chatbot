import { ApprovalDecisionError, decideApproval } from "@/lib/agents/command-center";
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
import { withCommanderTenant } from "@/lib/agents/commander-scope";

/**
 * Deciding an approval is a human action.
 *
 * `canManage` admits only an owner/admin session, so an agent key cannot decide
 * anything, including its own request. The write itself is one conditional
 * UPDATE scoped to the caller's organisation and to `status = 'pending'`, so a
 * second decision, or a decision on another tenant's approval, changes no row.
 */
async function POSTHandler(
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

  // Both spellings are accepted so existing callers keep working; whichever is
  // sent must survive the same trimming rules.
  const parsed = await validateJson(
    request,
    z
      .object({
        decision: z.enum(["approved", "rejected"]),
        note: z.string().max(2000).optional(),
        reason: z.string().max(2000).optional(),
      })
      .strict()
  );
  if (!parsed.ok) {
    return badRequest(parsed.reason);
  }

  const rawReason = (parsed.data.reason ?? parsed.data.note ?? "").trim();

  /**
   * A rejection refuses somebody's work, so it has to be explainable later.
   * The rule lives here, on the server: the console also asks for a reason, but
   * an interface is not a control, and a request can arrive without one.
   *
   * Approval stays optional-reason deliberately: refusing to let an owner say
   * "yes" without a note would break existing clients, and a yes needs no excuse.
   */
  if (parsed.data.decision === "rejected") {
    if (rawReason.length === 0) {
      return badRequest("reason_required");
    }
    if (rawReason.length < 4) {
      return badRequest("reason_too_short");
    }
  }
  if (rawReason.length > 1000) {
    return badRequest("reason_too_long");
  }

  let approval;
  try {
    approval = await decideApproval({
      organizationId: callerOrganizationId(caller),
      approvalId: parsedId.data,
      decision: parsed.data.decision,
      decidedBy: `owner:${caller.userId.slice(0, 8)}`,
      reason: rawReason,
    });
  } catch (error) {
    // The domain repeats the reason rule for every caller, not just this route;
    // its refusal becomes the same 400 shape this endpoint has always returned.
    if (error instanceof ApprovalDecisionError) {
      return badRequest(error.code);
    }
    throw error;
  }

  if (!approval) {
    // Same answer for "not yours", "already decided" and "does not exist", so
    // the endpoint cannot be used to probe another tenant's approvals.
    return json({ error: "not_found" }, 404);
  }

  // The domain wrote the audit row inside the same transaction as the state
  // change. Writing it here too would duplicate every decision, so this route
  // now only reports the result.

  return json({ approval });
}

// Runs inside the caller's tenant transaction when TENANT_RLS_ENABLED is on.
export const POST = withCommanderTenant(POSTHandler);
