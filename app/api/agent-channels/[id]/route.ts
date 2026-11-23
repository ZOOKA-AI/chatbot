import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { withRequestTenantHandler } from "@/lib/db/request-tenant";
import { unlinkAgentChannel } from "@/lib/db/agent-channels";

export const dynamic = "force-dynamic";

async function DELETEImpl(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const context = await getWorkspaceContext();
  if (!context) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const removed = await unlinkAgentChannel(context.organizationId, id);
  if (!removed) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

export const DELETE = withRequestTenantHandler(DELETEImpl);
