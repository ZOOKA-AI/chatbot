import "server-only";

import {
  getIntegrationTokens,
  markConnectionError,
} from "@/lib/integrations/catalog";

const BASE = "https://promoteapi.telegram.org";

export const TELEGRAM_ADS_NOT_CONNECTED =
  "Telegram Ads is not connected for this workspace. Connect it from Settings → Integrations with the promoteapi token (ads.telegram.org → API).";

type TelegramResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string };

async function telegramGet(
  workspaceId: string,
  method: string,
  params: Record<string, string> = {}
): Promise<TelegramResult> {
  const tokens = await getIntegrationTokens(workspaceId, "telegram_ads");
  const token =
    tokens && typeof tokens.accessToken === "string" ? tokens.accessToken : "";
  if (!token) {
    return { ok: false, error: TELEGRAM_ADS_NOT_CONNECTED };
  }
  try {
    const query = new URLSearchParams(params).toString();
    const response = await fetch(
      `${BASE}/${method}${query ? `?${query}` : ""}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "User-Agent": "zooka-ai",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      }
    );
    const text = await response.text();
    const payload = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    if (!response.ok) {
      const message = `Telegram Ads returned ${response.status}`;
      await markConnectionError(workspaceId, "telegram_ads", message);
      return { ok: false, error: message };
    }
    if (payload.ok === false) {
      const message =
        typeof payload.error === "string"
          ? `Telegram Ads: ${payload.error}`
          : "Telegram Ads rejected the request";
      return { ok: false, error: message };
    }
    return { ok: true, data: payload };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Telegram Ads request failed",
    };
  }
}

function asNumber(value: unknown) {
  return typeof value === "number" ? value : null;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : null;
}

export async function getTelegramAdsAccount(workspaceId: string) {
  const result = await telegramGet(workspaceId, "getCurrentAccount");
  if (!result.ok) {
    return result;
  }
  const account = (result.data.result as Record<string, unknown>) ?? {};
  return {
    ok: true as const,
    data: {
      accountId: asString(account.account_id),
      title: asString(account.title),
      currency: asString(account.currency),
      spentBudget: asNumber(account.spent_budget),
      remainingBudget: asNumber(account.remaining_budget),
      adsBudget: asNumber(account.ads_budget),
    },
  };
}

export async function listTelegramAds(
  workspaceId: string,
  options: { limit?: number; status?: string } = {}
) {
  const result = await telegramGet(workspaceId, "getAdsList", {
    limit: String(Math.min(Math.max(options.limit ?? 20, 1), 100)),
    return_target: "true",
  });
  if (!result.ok) {
    return result;
  }
  const payload = (result.data.result as Record<string, unknown>) ?? {};
  const rows = Array.isArray(payload.ads) ? (payload.ads as unknown[]) : [];
  const ads = rows
    .map((row) => row as Record<string, unknown>)
    .map((ad) => ({
      adId: asNumber(ad.ad_id),
      title: asString(ad.title),
      status: asString(ad.status),
      currency: asString(ad.currency),
      cpm: asNumber(ad.cpm),
      views: asNumber(ad.views),
      clicks: asNumber(ad.clicks),
      joins: asNumber(ad.joins),
      spentBudget: asNumber(ad.spent_budget),
      remainingBudget: asNumber(ad.remaining_budget),
      dailyBudgetLimit: asNumber(ad.daily_budget_limit),
    }))
    .filter((ad) => !options.status || ad.status === options.status);

  const views = ads.reduce((sum, ad) => sum + (ad.views ?? 0), 0);
  const clicks = ads.reduce((sum, ad) => sum + (ad.clicks ?? 0), 0);
  const spent = ads.reduce((sum, ad) => sum + (ad.spentBudget ?? 0), 0);

  return {
    ok: true as const,
    data: {
      totalCount: asNumber(payload.total_count) ?? ads.length,
      currency: asString((rows[0] as Record<string, unknown>)?.currency) ?? null,
      totals: {
        views,
        clicks,
        spentBudget: Math.round(spent * 10000) / 10000,
      },
      ads,
    },
  };
}
