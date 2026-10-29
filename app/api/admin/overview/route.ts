import { NextResponse } from "next/server";
import { requireWorkspaceRole } from "@/lib/auth/workspace";
import { getAdminOverview, getAdminRecentActivity } from "@/lib/db/queries";

export async function GET() {
  const context = await requireWorkspaceRole("admin");
  if (!context) {
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
