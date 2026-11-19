import { callerOrganizationId, callerUserId, json, resolveCaller, unauthorized } from "@/lib/agents/auth";
import { withCommanderTenant } from "@/lib/agents/commander-scope";
import { ApprovalError, approveApproval, getApproval, revokeApproval } from "@/lib/studio/spend-approvals";

/**
 * Deciding an approval.
 *
 * The decision is a state transition on a row, not a flag on a request: a second approval attempt finds the
 * row already approved and changes nothing, and an id from another workspace is not found at all.
 */

async function GETHandler(request: Request, context: { params: Promise<{ id: string }> }) {
  const caller = await resolveCaller(request);
  if (!caller) return unauthorized();
  const { id } = await context.params;
  const approval = await getApproval(callerOrganizationId(caller), id);
  if (!approval) return json({ error: "approval_not_found" }, 404);
  return json({ approval });
}

async function POSTHandler(request: Request, context: { params: Promise<{ id: string }> }) {
  const caller = await resolveCaller(request);
  if (!caller || caller.kind !== "owner") return unauthorized();

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? "");
  const organizationId = callerOrganizationId(caller);

  try {
    if (action === "approve") {
      const approval = await approveApproval({
        organizationId,
        id,
        approvedBy: callerUserId(caller),
        maxCostUsd: body.maxCostUsd == null ? undefined : Number(body.maxCostUsd),
      });
      return json({ approval });
    }
    if (action === "revoke") {
      const approval = await revokeApproval({
        organizationId,
        id,
        note: body.note == null ? undefined : String(body.note),
      });
      return json({ approval });
    }
    return json({ error: "unknown_action", allowed: ["approve", "revoke"] }, 400);
  } catch (error) {
    if (error instanceof ApprovalError) {
      const status = error.code.includes("not_found") ? 404 : 409;
      return json({ error: error.code }, status);
    }
    return json({ error: "approval_decision_failed" }, 500);
  }
}

export const GET = withCommanderTenant(GETHandler);
export const POST = withCommanderTenant(POSTHandler);
