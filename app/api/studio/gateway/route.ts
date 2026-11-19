import { callerOrganizationId, json, resolveCaller, unauthorized } from "@/lib/agents/auth";
import { withCommanderTenant } from "@/lib/agents/commander-scope";
import { paidGenerationEnabled, spendCapUsd } from "@/lib/studio/paid-switch";
import { gatewayProviders } from "@/lib/studio/gateway/providers";

/**
 * The gateway's own description of itself.
 *
 * It answers, per provider, the questions the directive lists: identity, capabilities, readiness, and
 * whether it can execute here. Readiness is returned as a code because "missing credential" and
 * "credential present but unverified" are different facts and a boolean would blur them.
 *
 * Discovery is not attempted for providers without a credential: a page render must not wait on a vendor
 * that cannot answer anyway. Models are counted only where a credential exists, and the count says so.
 */
async function GETHandler(request: Request) {
  const caller = await resolveCaller(request);
  if (!caller || caller.kind !== "owner") return unauthorized();
  const organizationId = callerOrganizationId(caller);

  const paidEnabled = paidGenerationEnabled();
  const capUsd = spendCapUsd();

  const providers = await Promise.all(
    gatewayProviders().map(async (provider) => {
      const readiness = provider.readiness();
      let modelCount: number | null = null;
      if (readiness.ready) {
        for (const capability of provider.capabilities) {
          try {
            const models = await provider.listModels(capability);
            modelCount = (modelCount ?? 0) + models.length;
          } catch {
            // A vendor that fails discovery is reported as ready-but-unreachable by readiness alone;
            // the count stays null rather than becoming a misleading zero.
            modelCount = null;
          }
        }
      }
      return {
        id: provider.id,
        tier: provider.tier,
        paid: provider.paid,
        executable: provider.executable,
        capabilities: provider.capabilities,
        readiness,
        modelCount,
      };
    })
  );

  return json({
    organizationId,
    paidGenerationEnabled: paidEnabled,
    capUsd,
    providers,
  });
}

export const GET = withCommanderTenant(GETHandler);
