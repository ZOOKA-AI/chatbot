import { NextResponse } from "next/server";
import { requirePlatformRole } from "@/lib/auth/platform-role";
import { requireWorkspaceRole } from "@/lib/auth/workspace";
import { getAdminOverview, getAdminRecentActivity } from "@/lib/db/queries";

export async function GET() {
  // Platform grant first (PlatformRole, by user id); the workspace lookup only
  // decides which workspace these still-workspace-scoped numbers describe.
  const admin = await requirePlatformRole("admin", "api.admin.overview");
  const context = admin ? await requireWorkspaceRole("member") : null;
  if (!(admin && context && context.user.id === admin.userId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const [overview, activity] = await Promise.all([
      getAdminOverview(context.organizationId),
      getAdminRecentActivity({ organizationId: context.organizationId, limit: 20 }),
    ]);
    return NextResponse.json({ overview, activity });
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
