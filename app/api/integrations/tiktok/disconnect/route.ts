import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { withRequestTenantHandler } from "@/lib/db/request-tenant";
import { revokeToken } from "@/lib/integrations/tiktok/api";
import {
  deleteTiktokConnection,
  getTiktokAccess,
} from "@/lib/integrations/tiktok/store";

/**
 * Disconnect removes only this person's authorization, and asks TikTok to
 * revoke the token first so the credential dies on their side too.
 */
async function POSTImpl() {
  const context = await getWorkspaceContext();
  if (!context || context.user.type !== "regular") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const access = await getTiktokAccess(context.organizationId, context.user.id);
  const revoked = access ? await revokeToken(access.accessToken) : false;
  const removed = await deleteTiktokConnection(
    context.organizationId,
    context.user.id
  );
  return NextResponse.json({
    disconnected: removed,
    revokedAtProvider: revoked,
  });
}

export const POST = withRequestTenantHandler(POSTImpl);
