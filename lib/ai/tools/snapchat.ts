import { tool } from "ai";
import { z } from "zod";
import {
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
  };
}
