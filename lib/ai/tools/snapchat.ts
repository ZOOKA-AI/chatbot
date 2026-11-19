import { tool } from "ai";
import { z } from "zod";
import {
  getSnapchatCampaignStats,
  getSnapchatOverview,
  listSnapchatCampaigns,
} from "@/lib/integrations/snapchat/api";

/**
 * Snapchat tools read the connected organization through the Marketing API:
 * the organization, its ad accounts, and campaign status. Nothing here spends
 * money or edits a campaign.
 */
export function createSnapchatTools(organizationId: string) {
  return {
    readSnapchatOverview: tool({
      description:
        "Read the connected Snapchat organization and its ad accounts (name, status, currency, timezone).",
      inputSchema: z.object({}),
      execute: async () => {
        const result = await getSnapchatOverview(organizationId);
        if (!result.ok) {
          return { error: result.error };
        }
        return result.data;
      },
    }),

    listSnapchatCampaigns: tool({
      description:
        "List Snapchat ad campaigns with their status, objective and flight dates for the connected organization.",
      inputSchema: z.object({
        adAccountId: z
          .string()
          .optional()
          .describe("Restrict to one ad account id from readSnapchatOverview."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(25)
          .optional()
          .describe("How many campaigns to return (default 10)."),
      }),
      execute: async ({ adAccountId, limit }) => {
        const result = await listSnapchatCampaigns(organizationId, {
          adAccountId,
          limit,
        });
        if (!result.ok) {
          return { error: result.error };
        }
        return result.data;
      },
    }),

    snapchatCampaignStats: tool({
      description:
        "Read Snapchat campaign performance (impressions, swipes, spend) for the last N days, with totals in the ad account currency.",
      inputSchema: z.object({
        days: z
          .number()
          .int()
          .min(1)
          .max(90)
          .optional()
          .describe("How many days back to measure (default 30)."),
        adAccountId: z
          .string()
          .optional()
          .describe("Restrict to one ad account id from readSnapchatOverview."),
      }),
      execute: async ({ days, adAccountId }) => {
        const result = await getSnapchatCampaignStats(organizationId, {
          days,
          adAccountId,
        });
        if (!result.ok) {
          return { error: result.error };
        }
        return result.data;
      },
    }),
  };
}
