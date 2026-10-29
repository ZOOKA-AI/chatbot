import { NextResponse } from "next/server";
import { requireWorkspaceRole } from "@/lib/auth/workspace";
import { getAdminUsers } from "@/lib/db/queries";

export async function GET(request: Request) {
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
