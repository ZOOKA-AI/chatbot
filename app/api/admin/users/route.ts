import { NextResponse } from "next/server";

import { auth } from "@/app/(auth)/auth";
import { requireWorkspaceRole } from "@/lib/auth/workspace";
import { getAdminUsers } from "@/lib/db/queries";

export async function GET(request: Request) {
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
