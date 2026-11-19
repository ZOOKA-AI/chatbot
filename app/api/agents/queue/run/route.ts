import { z } from "zod";

import {
  badRequest,
  callerOrganizationId,
  canManage,
  forbidden,
  json,
  resolveCaller,
  unauthorized,
} from "@/lib/agents/auth";
import { withCommanderTenant } from "@/lib/agents/commander-scope";
import { runScheduler } from "@/lib/agents/scheduler";
import { validateJson } from "@/lib/validation/api";

export const maxDuration = 60;

/**
 * Run this workspace's queued work, now, on the owner's request.
 *
 * The queue had no executor: an action created a real task and the row sat in `pending` for
 * ever, because the only caller of the worker was an agent holding a key, and the scheduling
 * pass had no trigger. This is the smallest honest answer — the owner, in their own workspace,
 * runs a bounded number of their own tasks and sees what the worker actually did.
 *
 * Scoped three ways: the workspace comes from the session and never from the body, the pass is
 * limited to that workspace, and the batch is capped, so one press cannot drain a large queue
 * or reach another tenant's tasks.
 */

const bodySchema = z
  .object({
    limit: z.number().int().min(1).max(3).optional(),
  })
  .strict();

async function POSTHandler(request: Request) {
  const caller = await resolveCaller(request);
  if (!caller) return unauthorized();
  if (!canManage(caller)) return forbidden("owner_or_admin_required");

  const parsed = await validateJson(request, bodySchema);
  if (!parsed.ok) return badRequest(parsed.reason);

  const limit = parsed.data.limit ?? 1;
  const organizationId = callerOrganizationId(caller);

  const result = await runScheduler({
    organizationId,
    batchSize: limit,
    perOrganizationLimit: limit,
    // Headroom for work already running elsewhere: this call is bounded by `limit` tasks in
    // one workspace, not by whatever the platform-wide cap happens to be at this second.
    globalLimit: limit + 2,
  });

  return json({ ok: true, organizationId, limit, result });
}

export const POST = withCommanderTenant(POSTHandler);
