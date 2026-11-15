import { tool } from "ai";
import { z } from "zod";
import {
  getTelegramAdsAccount,
  listTelegramAds,
} from "@/lib/integrations/telegram-ads/api";

/**
 * Telegram Ads (promoteapi.telegram.org) read tools: the account budget and the
 * ads with their performance. Nothing here edits, pauses or funds an ad.
 */
export function createTelegramAdsTools(organizationId: string) {
  return {
    readTelegramAdsAccount: tool({
      description:
        "Read the connected Telegram Ads account: title, currency, spent budget, remaining budget and ads budget.",
      inputSchema: z.object({}),
      execute: async () => {
        const result = await getTelegramAdsAccount(organizationId);
        if (!result.ok) {
          return { error: result.error };
        }
        return result.data;
      },
    }),

    listTelegramAds: tool({
      description:
        "List Telegram Ads campaigns with status, CPM, views, clicks and spend, plus totals across the returned ads.",
      inputSchema: z.object({
        status: z
          .string()
          .optional()
          .describe("Filter by status, e.g. on_hold, stopped, declined."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("How many ads to read (default 20)."),
      }),
      execute: async ({ status, limit }) => {
        const result = await listTelegramAds(organizationId, { status, limit });
        if (!result.ok) {
          return { error: result.error };
        }
        return result.data;
      },
    }),
  };
}
