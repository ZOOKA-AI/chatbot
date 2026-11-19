import { NextResponse } from "next/server";

import { requireWorkspaceRole } from "@/lib/auth/workspace";
import { withRequestTenantHandler } from "@/lib/db/request-tenant";
import {
  disconnectGrowth,
  getGrowthConnectionStatus,
} from "@/lib/integrations/google-growth/server";

/**
 * Connection status for the growth panel. Returns deliberately no secret
 * material: no access token, no refresh token, no ciphertext, no client secret.
 * The frontend only ever learns whether a grant exists and which scopes it has.
 */
async function GETImpl() {
  const context = await requireWorkspaceRole("owner");
  if (!context || context.user.type !== "regular") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const status = await getGrowthConnectionStatus(context.organizationId);
  return NextResponse.json(status, {
    headers: { "cache-control": "no-store" },
  });
}

async function DELETEImpl() {
  const context = await requireWorkspaceRole("owner");
  if (!context || context.user.type !== "regular") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const result = await disconnectGrowth(context.organizationId);
  return NextResponse.json(result, {
    headers: { "cache-control": "no-store" },
  });
}

export const GET = withRequestTenantHandler(GETImpl);
export const DELETE = withRequestTenantHandler(DELETEImpl);
