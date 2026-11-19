import { NextResponse } from "next/server";

import { auth } from "@/app/(auth)/auth";
import { requireWorkspaceRole } from "@/lib/auth/workspace";
import { getAdminOverview, getAdminRecentActivity } from "@/lib/db/queries";

export async function GET() {
  // "No session" and "session without the role" are different answers: 401 tells a client to sign
  // in, 403 tells a signed-in member that this is not theirs. Collapsing them into 403 hid the
  // difference from every caller.
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

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
