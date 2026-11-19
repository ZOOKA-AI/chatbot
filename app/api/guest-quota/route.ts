import { readGuestQuota } from "@/lib/guest";

/**
 * Read-only allowance check for anonymous visitors, so the landing demo can
 * show the true remaining count (and when it resets) without spending a
 * message. The chat endpoint remains the only place that consumes one.
 */
export async function GET() {
  try {
    const quota = await readGuestQuota();
    return Response.json(quota, {
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return Response.json(
      { used: 0, limit: 10, resetsAt: null, day: null },
      { headers: { "cache-control": "no-store" } }
    );
  }
}
