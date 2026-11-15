import "server-only";

import { getIntegrationTokens } from "@/lib/integrations/catalog";
import { getFacebookPage } from "@/lib/integrations/facebook/graph";
import { listEmailDomains } from "@/lib/integrations/improvmx/api";
import { getInstagramProfile } from "@/lib/integrations/instagram/graph";
import { getLinkedInProfile } from "@/lib/integrations/linkedin/api";
import { listGoogleAdsCustomers } from "@/lib/integrations/ryze/api";
import { getSnapchatOverview } from "@/lib/integrations/snapchat/api";
import { getTelegramAdsAccount } from "@/lib/integrations/telegram-ads/api";
import { getTelegramBot } from "@/lib/integrations/telegram-bot/api";
import { INTEGRATION_PLAYBOOKS } from "@/lib/integrations/playbooks";

type VerifyResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

export type IntegrationReadiness = {
  providerId: string;
  connected: boolean;
  /** True only when a live provider call answered with real data. */
  verified: boolean;
  detail: string;
  selfServe: boolean;
};

/**
 * One live proof per provider, run against the workspace's own stored
 * credential. A stored token is not evidence: only an answered provider call
 * counts, so this is what the agent quotes when a tenant asks "هل الربط شغال؟".
 */
const VERIFIERS: Record<string, (workspaceId: string) => Promise<VerifyResult>> =
  {
    instagram: (id) => getInstagramProfile(id),
    meta: (id) => getFacebookPage(id),
    linkedin: (id) => getLinkedInProfile(id),
    snapchat: (id) => getSnapchatOverview(id),
    telegram_ads: (id) => getTelegramAdsAccount(id),
    telegram_bot: (id) => getTelegramBot(id),
    improvmx: (id) => listEmailDomains(id),
    google_ads: (id) => listGoogleAdsCustomers(id),
  };

function summarize(data: unknown) {
  if (typeof data === "string") {
    return data.slice(0, 300);
  }
  try {
    const text = JSON.stringify(data);
    return text.length > 400 ? `${text.slice(0, 400)}…` : text;
  } catch {
    return "answered";
  }
}

async function hasStoredCredential(workspaceId: string, providerId: string) {
  try {
    const tokens = await getIntegrationTokens(workspaceId, providerId);
    return Boolean(tokens && Object.keys(tokens).length > 0);
  } catch {
    return false;
  }
}

export async function checkIntegrationReadiness(
  workspaceId: string,
  providerId: string
): Promise<IntegrationReadiness> {
  const playbook = INTEGRATION_PLAYBOOKS.find(
    (entry) => entry.providerId === providerId
  );
  const selfServe = playbook?.selfServe ?? false;
  const verifier = VERIFIERS[providerId];
  if (!verifier) {
    const connected = await hasStoredCredential(workspaceId, providerId);
    return {
      providerId,
      connected,
      verified: false,
      detail: connected
        ? "الاعتماد محفوظ، ولا يوجد فحص حيّ لهذا المزوّد بعد."
        : "غير مربوط، ولا يوجد فحص حيّ لهذا المزوّد بعد.",
      selfServe,
    };
  }
  const result = await verifier(workspaceId);
  if (result.ok) {
    return {
      providerId,
      connected: true,
      verified: true,
      detail: summarize(result.data),
      selfServe,
    };
  }
  const connected = await hasStoredCredential(workspaceId, providerId);
  return {
    providerId,
    connected,
    verified: false,
    detail: result.error,
    selfServe,
  };
}

export async function listIntegrationReadiness(workspaceId: string) {
  const providerIds = INTEGRATION_PLAYBOOKS.map((entry) => entry.providerId);
  const results: IntegrationReadiness[] = [];
  for (const providerId of providerIds) {
    results.push(await checkIntegrationReadiness(workspaceId, providerId));
  }
  return results;
}
