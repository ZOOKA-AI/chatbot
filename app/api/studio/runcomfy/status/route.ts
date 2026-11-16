import { callerOrganizationId, json, resolveCaller, unauthorized } from "@/lib/agents/auth";
import { withCommanderTenant } from "@/lib/agents/commander-scope";
import { paidGenerationEnabled, spendCapUsd } from "@/lib/studio/cloud-cost";
import { isRunComfyConfigured, probeConnection } from "@/lib/studio/runcomfy";

/**
 * A real, non-billable connectivity check for RunComfy.
 *
 * It reads discovery and the wallet and submits nothing, which is what lets the studio say "connected"
 * on evidence rather than on a token being present. The token itself never appears in the response: the
 * client redacts it from every failure message, and this route only ever returns the probe's own fields.
 *
 * `?deep=0` stops at "is a token configured" without touching the network, so a page render cannot wait
 * on a third party. The default is the full probe because a status page that guesses is not a status page.
 */
async function GETHandler(request: Request) {
  const caller = await resolveCaller(request);
  if (!caller || caller.kind !== "owner") return unauthorized();
  const organizationId = callerOrganizationId(caller);

  const configured = isRunComfyConfigured();
  const paidEnabled = paidGenerationEnabled();
  const capUsd = spendCapUsd();

  if (!configured) {
    return json({
      provider: "runcomfy-cloud",
      configured: false,
      connected: false,
      paidGenerationEnabled: paidEnabled,
      capUsd,
      // Named honestly: the integration exists, the credential does not.
      blocker: "RUNCOMFY_API_TOKEN is not set on the server",
      capabilities: [],
      balanceUsd: null,
      modelsVisible: 0,
    });
  }

  const url = new URL(request.url);
  if (url.searchParams.get("deep") === "0") {
    return json({
      provider: "runcomfy-cloud",
      configured: true,
      connected: null,
      paidGenerationEnabled: paidEnabled,
      capUsd,
      blocker: null,
      note: "credential present; deep probe skipped",
      capabilities: [],
      balanceUsd: null,
      modelsVisible: 0,
    });
  }

  const probe = await probeConnection();
  return json({
    provider: "runcomfy-cloud",
    organizationId,
    configured: true,
    connected: probe.connected,
    paidGenerationEnabled: paidEnabled,
    capUsd,
    blocker: probe.connected ? null : `${probe.error?.code}: ${probe.error?.detail}`,
    // Only categories the account can actually run, read from the live catalogue.
    capabilities: probe.categories,
    modelsVisible: probe.modelsVisible,
    balanceUsd: probe.balanceUsd,
    balanceMicrodollars: probe.balanceMicrodollars,
  });
}

export const GET = withCommanderTenant(GETHandler);
