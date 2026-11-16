import { callerOrganizationId, json, resolveCaller, unauthorized } from "@/lib/agents/auth";
import { withCommanderTenant } from "@/lib/agents/commander-scope";
import {
  LEVEL_ONE_CAPABILITIES,
  engineRegistry,
  levelOneSelfSufficient,
  paidPolicy,
  selectEngine,
  type StudioCapability,
} from "@/lib/studio/engine-policy";

/**
 * The engine matrix: what would run each capability right now, and why.
 *
 * This is the answer to "which engine do we use?" without hard-coding a vendor into the product. It
 * shows the decision per capability, what was refused and why, and whether the platform's own work is
 * independent of any provider. Nothing here executes anything.
 */
async function GETHandler(request: Request) {
  const caller = await resolveCaller(request);
  if (!caller || caller.kind !== "owner") return unauthorized();
  void callerOrganizationId(caller);

  const capabilities: StudioCapability[] = [...LEVEL_ONE_CAPABILITIES, "image_generate"];
  const decisions = capabilities.map((capability) => selectEngine({ capability }));
  const policy = paidPolicy();

  return json({
    decisions,
    engines: engineRegistry().map((engine) => ({
      id: engine.id,
      tier: engine.tier,
      capabilities: engine.capabilities,
      paid: engine.paid,
      configured: engine.configured(),
      note: engine.note,
    })),
    paid: { enabled: policy.enabled, approvalCited: policy.approvalReference !== null },
    selfSufficient: levelOneSelfSufficient(),
  });
}

export const GET = withCommanderTenant(GETHandler);
