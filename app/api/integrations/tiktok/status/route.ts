import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { withRequestTenantHandler } from "@/lib/db/request-tenant";
import { isTiktokConfigured, tiktokRedirectUri } from "@/lib/integrations/tiktok/config";
import {
  getTiktokConnectionView,
  isTiktokStorageKeyPresent,
  listUploads,
} from "@/lib/integrations/tiktok/store";

/**
 * Read-only view of the caller's own TikTok connection.
 * Tokens never appear in a response: only the account they belong to.
 */
async function GETImpl() {
  const context = await getWorkspaceContext();
  if (!context || context.user.type !== "regular") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const view = await getTiktokConnectionView(
    context.organizationId,
    context.user.id
  );
  const uploads = await listUploads(context.organizationId, context.user.id, 10);
  return NextResponse.json({
    configured: isTiktokConfigured() && isTiktokStorageKeyPresent(),
    redirectUri: tiktokRedirectUri(),
    connection: view,
    uploads,
    scope: "user",
  });
}

export const GET = withRequestTenantHandler(GETImpl);
