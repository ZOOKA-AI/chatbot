import { z } from "zod";

import { canManage, callerOrganizationId, json, resolveCaller, unauthorized } from "@/lib/agents/auth";
import { withCommanderTenant } from "@/lib/agents/commander-scope";
import { createStoredPlan, getStoredPlan, listStoredPlans } from "@/lib/agents/launch-store";
import { validateJson, validateQuery } from "@/lib/validation/api";

/**
 * The Business Launch Agent, reachable.
 *
 * Two verbs, no completion endpoint: a plan is created and read here, and step states move
 * only through setStepState, which refuses to complete a step whose dependencies have not
 * completed. A route that could set a step to COMPLETED directly would be a way to write
 * "website published" without a website.
 */

const briefSchema = z
  .object({
    businessName: z.string().min(2).max(120),
    industry: z.string().min(2).max(120),
    city: z.string().min(2).max(80),
    country: z.string().min(2).max(80),
    languages: z.array(z.enum(["ar", "en"])).min(1).max(2),
    desiredDomain: z.string().min(4).max(120).optional(),
    services: z.array(z.string().min(2).max(80)).max(20).optional(),
    phone: z.string().max(40).optional(),
    email: z.string().max(160).optional(),
    existingAccounts: z.array(z.string().min(2).max(40)).max(12).optional(),
  })
  .strict();

async function GETHandler(request: Request) {
  const caller = await resolveCaller(request);
  if (!caller) return unauthorized();

  const query = validateQuery(
    request,
    z
      .object({
        planId: z.string().uuid().optional(),
        limit: z.coerce.number().int().min(1).max(50).optional(),
      })
      .strict()
  );
  if (!query.ok) return json({ error: "invalid_query", reason: query.reason }, 400);

  const organizationId = callerOrganizationId(caller);

  if (query.data.planId) {
    const plan = await getStoredPlan({ organizationId, planId: query.data.planId });
    // Another workspace's plan is not a 403 here: it does not exist from this side.
    if (!plan) return json({ error: "not_found" }, 404);
    return json({ plan });
  }

  const plans = await listStoredPlans({ organizationId, limit: query.data.limit });
  return json({ plans, count: plans.length });
}

async function POSTHandler(request: Request) {
  const caller = await resolveCaller(request);
  if (!caller) return unauthorized();

  if (!canManage(caller)) {
    return json({ error: "forbidden", reason: "owner_or_admin_required" }, 403);
  }

  const parsed = await validateJson(
    request,
    z
      .object({
        brief: briefSchema,
        connectedProviders: z.array(z.string().min(2).max(40)).max(20).optional(),
      })
      .strict()
  );
  if (!parsed.ok) return json({ error: "invalid_body", reason: parsed.reason }, 400);

  const plan = await createStoredPlan({
    organizationId: callerOrganizationId(caller),
    brief: parsed.data.brief,
    connectedProviders: parsed.data.connectedProviders,
    createdBy: `owner:${caller.userId.slice(0, 8)}`,
  });

  return json({ plan }, 201);
}

export const GET = withCommanderTenant(GETHandler);
export const POST = withCommanderTenant(POSTHandler);
