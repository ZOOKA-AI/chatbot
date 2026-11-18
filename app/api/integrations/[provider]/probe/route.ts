import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { probeIntegration } from "@/lib/integrations/connectors/probe";
import { withRequestTenantHandler } from "@/lib/db/request-tenant";

/**
 * Run the real check for one integration, on the tenant's own credential.
 *
 * POST only: a GET would let a link or a prefetch fire provider calls. The
 * handler is tenant-scoped and role-gated to the workspace owner/admin, because
 * a probe writes an audit row and spends one of the connector's monthly reads.
 */
async function POSTImpl(
  _request: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const context = await getWorkspaceContext();
  if (!context) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (context.role !== "owner" && context.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const result = await probeIntegration({
    workspaceId: context.organizationId,
    providerId: provider,
    userId: context.user.id,
  });

  const status = result.code === "not_connected" ? 409 : result.ok ? 200 : 502;
  return NextResponse.json(result, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export const POST = withRequestTenantHandler(POSTImpl);
