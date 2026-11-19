import { NextResponse } from "next/server";

import { getWorkspaceContext } from "@/lib/auth/workspace";
import { withRequestTenantHandler } from "@/lib/db/request-tenant";
import { decideN8nAdminAccess } from "@/lib/integrations/n8n/admin-access";
import { buildN8nAdminOverview } from "@/lib/integrations/n8n/admin-overview";

/**
 * Read-only JSON view of one workspace's n8n instance.
 *
 * GET only: there is no POST/PATCH/DELETE handler here, so no request to this path can start, edit or
 * delete a workflow. The payload carries workflow names, statuses and deep links, never the API key.
 */
async function GETImpl() {
  const context = await getWorkspaceContext();
  const access = decideN8nAdminAccess(
    context ? { role: context.role, userType: context.user?.type ?? null } : null
  );
  if (access === "unauthorized") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (access === "forbidden") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const overview = await buildN8nAdminOverview(context!.organizationId);
  return NextResponse.json(overview, {
    headers: { "cache-control": "no-store" },
  });
}

export const GET = withRequestTenantHandler(GETImpl);
