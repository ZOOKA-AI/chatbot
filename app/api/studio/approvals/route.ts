import { callerOrganizationId, callerUserId, json, resolveCaller, unauthorized } from "@/lib/agents/auth";
import { withCommanderTenant } from "@/lib/agents/commander-scope";
import { ApprovalError, listApprovals, requestApproval } from "@/lib/studio/spend-approvals";

/**
 * The approval screen's data source.
 *
 * Only a signed-in member of the workspace can see or create its approvals. Creating one reserves nothing;
 * it records a ceiling that a human can then authorise, so the flow is request → approve → spend.
 */

async function GETHandler(request: Request) {
  const caller = await resolveCaller(request);
  if (!caller) return unauthorized();
  const url = new URL(request.url);
  const status = url.searchParams.get("status") as "pending" | "approved" | "consumed" | "revoked" | "uncertain" | null;
  const rows = await listApprovals(callerOrganizationId(caller), {
    status: status ?? undefined,
    limit: Number(url.searchParams.get("limit") ?? 50),
  });
  return json({ approvals: rows });
}

async function POSTHandler(request: Request) {
  const caller = await resolveCaller(request);
  if (!caller) return unauthorized();

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const required = ["provider", "modelId", "capability", "operation", "idempotencyKey"] as const;
  const missing = required.filter((key) => typeof body[key] !== "string" || !String(body[key]).trim());
  if (missing.length > 0) return json({ error: "invalid_body", missing }, 400);

  try {
    const approval = await requestApproval({
      organizationId: callerOrganizationId(caller),
      requestedBy: callerUserId(caller),
      projectId: body.projectId == null ? null : String(body.projectId),
      provider: String(body.provider),
      modelId: String(body.modelId),
      capability: String(body.capability),
      operation: String(body.operation),
      quotedCostUsd: Number(body.quotedCostUsd),
      maxCostUsd: body.maxCostUsd == null ? undefined : Number(body.maxCostUsd),
      idempotencyKey: String(body.idempotencyKey),
      ttlMinutes: body.ttlMinutes == null ? undefined : Number(body.ttlMinutes),
      note: body.note == null ? null : String(body.note),
    });
    return json({ approval }, 201);
  } catch (error) {
    if (error instanceof ApprovalError) return json({ error: error.code }, 400);
    return json({ error: "approval_request_failed" }, 500);
  }
}

export const GET = withCommanderTenant(GETHandler);
export const POST = withCommanderTenant(POSTHandler);
