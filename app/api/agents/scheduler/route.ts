import { timingSafeEqual } from "node:crypto";

import { runScheduler } from "@/lib/agents/scheduler";

export const maxDuration = 300;

/** Constant-time compare, so a wrong token cannot be discovered byte by byte. */
function matches(candidate: string, expected: string) {
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function authorize(request: Request) {
  const expected = process.env.SCHEDULER_TOKEN;
  // No token configured means the endpoint is closed, never open.
  if (!expected) return false;
  const direct = request.headers.get("x-scheduler-token") ?? "";
  const bearer = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
  return matches(direct, expected) || matches(bearer, expected);
}

/**
 * One bounded scheduling pass. Called by a cron, a queue trigger, or a human
 * with the scheduler token. The work is capped by three numbers from the
 * environment (per organisation, global, batch) so an invocation always finishes.
 */
async function POSTHandler(request: Request) {
  if (!authorize(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runScheduler();
    return Response.json(result, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "platform_connection_required") {
      return Response.json(
        { error: "platform_connection_required", detail: "DATABASE_URL_PLATFORM is not configured." },
        { status: 503 }
      );
    }
    return Response.json({ error: "scheduler_failed", detail: message.slice(0, 300) }, { status: 500 });
  }
}

export const POST = POSTHandler;
export const GET = POSTHandler;
