// The growth funnel, for the admin panel and for any scheduler that reports on
// it. Read-only: it measures, it never publishes or changes anything.
import { NextResponse } from "next/server";

import { requirePlatformRole } from "@/lib/auth/platform-role";
import { getGrowthFunnel } from "@/lib/growth/funnel";

export async function GET(request: Request) {
  const admin = await requirePlatformRole("admin", "api.admin.growth");
  if (!admin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const days = Number(new URL(request.url).searchParams.get("days") ?? 30);

  try {
    const funnel = await getGrowthFunnel(Number.isFinite(days) ? days : 30);
    return NextResponse.json(funnel, {
      headers: { "cache-control": "private, no-store" },
    });
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
