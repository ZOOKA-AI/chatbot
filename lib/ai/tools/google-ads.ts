import { tool } from "ai";
import { z } from "zod";
import {
  googleAdsAccountSummary,
  listGoogleAdsCustomers,
  runGoogleAdsQuery,
} from "@/lib/integrations/ryze/api";

/**
 * Google Ads through the Ryze MCP connection (the Google Ads API itself needs a
 * developer token that only Ryze holds for us). Reads only: no mutate tools are
 * exposed here.
 */
export function createGoogleAdsTools(organizationId: string) {
  return {
    listGoogleAdsCustomers: tool({
      description:
        "List the Google Ads accounts this workspace can read, with their names and whether each is a manager account.",
      inputSchema: z.object({}),
      execute: async () => {
        const result = await listGoogleAdsCustomers(organizationId);
        if (!result.ok) {
          return { error: result.error };
        }
        return result.data;
      },
    }),

    googleAdsAccountSummary: tool({
      description:
        "Read a Google Ads account's totals (impressions, clicks, cost, conversions, CTR, CPA, ROAS) and campaign count for a date range.",
      inputSchema: z.object({
        customerId: z
          .string()
          .describe("Numeric Google Ads customer id, e.g. 8719423491."),
        startDate: z.string().describe("Start date, YYYY-MM-DD."),
        endDate: z.string().describe("End date, YYYY-MM-DD."),
      }),
      execute: async ({ customerId, startDate, endDate }) => {
        const result = await googleAdsAccountSummary(organizationId, {
          customerId,
          startDate,
          endDate,
        });
        if (!result.ok) {
          return { error: result.error };
        }
        return result.data;
      },
    }),

    runGoogleAdsQuery: tool({
      description:
        "Run a read-only GAQL query (must start with SELECT) against one Google Ads account and return the rows.",
      inputSchema: z.object({
        customerId: z.string().describe("Numeric Google Ads customer id."),
        query: z
          .string()
          .describe(
            "GAQL SELECT query, e.g. SELECT campaign.name, metrics.cost_micros FROM campaign"
          ),
      }),
      execute: async ({ customerId, query }) => {
        const result = await runGoogleAdsQuery(organizationId, {
          customerId,
          query,
        });
        if (!result.ok) {
          return { error: result.error };
        }
        return result.data;
      },
    }),
  };
}
