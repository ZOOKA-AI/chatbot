import { NextResponse } from "next/server";

import { getGrowthFunnel } from "@/lib/growth/funnel";
import { buildGrowthReport, parseReportDays } from "@/lib/growth/report";
import { verifySharedSecret } from "@/lib/webhooks/security";

/**
 * Read-only funnel report for the n8n Growth Engine.
 *
 * n8n holds one credential for this route, N8N_GROWTH_REPORT_SECRET, distinct
 * from the publishing secret, so a leaked report secret cannot drain a publish
 * queue and the other way round. The answer is aggregate counts per signup
 * channel; it never carries a user identifier.
 */
export async function POST(request: Request) {
  const secret = process.env.N8N_GROWTH_REPORT_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "n8n_growth_report_secret_not_configured" },
      { status: 500 }
    );
  }
  if (!verifySharedSecret(request.headers.get("x-n8n-secret"), secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown = null;
  const raw = await request.text();
  if (raw.trim()) {
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "body_malformed" }, { status: 400 });
    }
  }
  const days = parseReportDays(body);
  if (days === null) {
    return NextResponse.json({ error: "days_out_of_range" }, { status: 400 });
  }

  try {
    const funnel = await getGrowthFunnel(days);
    return NextResponse.json(buildGrowthReport(funnel), {
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "report_unavailable" }, { status: 503 });
  }
}
