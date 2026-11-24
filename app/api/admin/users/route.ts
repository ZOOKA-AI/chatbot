import { NextResponse } from "next/server";
import { requirePlatformRole } from "@/lib/auth/platform-role";
import { requireWorkspaceRole } from "@/lib/auth/workspace";
import { getAdminUsers } from "@/lib/db/queries";

export async function GET(request: Request) {
  // Platform grant first (PlatformRole, by user id); the workspace lookup only
  // decides which workspace these still-workspace-scoped numbers describe.
  const admin = await requirePlatformRole("admin", "api.admin.users");
  const context = admin ? await requireWorkspaceRole("member") : null;
  if (!(admin && context && context.user.id === admin.userId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const limit = Math.min(Math.max(Number(params.get("limit")) || 25, 1), 100);
  const offset = Math.max(Number(params.get("offset")) || 0, 0);

  try {
    const result = await getAdminUsers({
      organizationId: context.organizationId,
      limit,
      offset: Math.floor(offset),
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
