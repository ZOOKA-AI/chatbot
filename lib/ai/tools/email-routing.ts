import { tool } from "ai";
import { z } from "zod";
import {
  getEmailDomain,
  listEmailDomains,
} from "@/lib/integrations/improvmx/api";

/**
 * ImprovMX email routing, read only: which domains forward mail and to which
 * address each alias delivers.
 */
export function createEmailRoutingTools(organizationId: string) {
  return {
    listEmailDomains: tool({
      description:
        "List the email domains routed by the connected ImprovMX account, with each alias and its forwarding address.",
      inputSchema: z.object({}),
      execute: async () => {
        const result = await listEmailDomains(organizationId);
        if (!result.ok) {
          return { error: result.error };
        }
        return result.data;
      },
    }),

    readEmailDomain: tool({
      description:
        "Read one routed domain: whether it is active and the aliases it forwards.",
      inputSchema: z.object({
        domain: z.string().describe("Domain name, e.g. royalharoon.com"),
      }),
      execute: async ({ domain }) => {
        const result = await getEmailDomain(organizationId, domain);
        if (!result.ok) {
          return { error: result.error };
        }
        return result.data;
      },
    }),
  };
}
