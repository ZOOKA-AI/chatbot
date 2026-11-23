// The growth funnel, for the admin panel and for any scheduler that reports on
// it. Read-only: it measures, it never publishes or changes anything.
import { NextResponse } from "next/server";

import { requirePlatformRole } from "@/lib/auth/platform-role";
import { getGrowthFunnel } from "@/lib/growth/funnel";
import { getJourney } from "@/lib/growth/journey";

export async function GET(request: Request) {
  const admin = await requirePlatformRole("admin", "api.admin.growth");
  if (!admin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const days = Number(new URL(request.url).searchParams.get("days") ?? 30);

  try {
    const window = Number.isFinite(days) ? days : 30;
    const funnel = await getGrowthFunnel(window);
    // Journey steps are read independently; a failure there never hides the funnel.
    const journey = await getJourney(window).catch(() => null);
    return NextResponse.json({ ...funnel, journey }, {
      headers: { "cache-control": "private, no-store" },
    });
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
