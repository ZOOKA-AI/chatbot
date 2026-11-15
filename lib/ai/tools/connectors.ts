import { tool } from "ai";
import { z } from "zod";
import {
  runConnectorOperation,
  verifyConnectorConnection,
} from "@/lib/integrations/connectors/execute";
import {
  buildIntegrationMatrix,
  matrixTotals,
} from "@/lib/integrations/connectors/matrix";
import { CONNECTOR_SPECS, getConnectorSpec } from "@/lib/integrations/connectors/registry";

/**
 * Generic connector tools. They work for any tenant because every call is scoped
 * to the calling workspace and uses that workspace's own encrypted credential.
 * Reads only: writes are declared but refused, so the agent can never spend,
 * publish or send on the strength of a chat message.
 */
export function createConnectorTools(organizationId: string, userId?: string | null) {
  return {
    listConnectorMatrix: tool({
      description:
        "Return the SaaS integration capability matrix: for every provider, whether documentation, the connector, agent tools and tenant isolation exist, which read operations are available, and what blocks it. Never reports a live verification it did not perform.",
      inputSchema: z.object({}),
      execute: async () => {
        const rows = buildIntegrationMatrix();
        return {
          totals: matrixTotals(rows),
          note:
            "authenticationVerified and readOperationsVerified stay false here on purpose; run testConnectorConnection for a real proof.",
          rows: rows.map((row) => ({
            providerId: row.providerId,
            documentationReady: row.documentationReady,
            providerImplemented: row.providerImplemented,
            agentToolsVerified: row.agentToolsVerified,
            multiTenantIsolationVerified: row.multiTenantIsolationVerified,
            readOperations: row.readOperations,
            blockers: row.blockers,
          })),
        };
      },
    }),

    testConnectorConnection: tool({
      description:
        "Prove one provider connection for this workspace: uses the stored encrypted credential, calls the provider's own identity endpoint, and returns the real account or the real error.",
      inputSchema: z.object({
        providerId: z
          .string()
          .describe(
            "Connector id: slack, notion, twilio, shopify, tiktok, whatsapp, x, cloudflare, namecheap."
          ),
      }),
      execute: async ({ providerId }) => {
        return verifyConnectorConnection({
          workspaceId: organizationId,
          providerId: providerId.trim(),
          userId: userId ?? null,
        });
      },
    }),

    runConnectorRead: tool({
      description:
        "Run one read operation on a connected provider for this workspace and return a compact result. Refuses writes, unconnected providers and over-cap usage instead of pretending.",
      inputSchema: z.object({
        providerId: z.string().describe("Connector id."),
        operationId: z
          .string()
          .describe("Read operation id, e.g. list_channels, search, list_products, list_zones."),
      }),
      execute: async ({ providerId, operationId }) => {
        const spec = getConnectorSpec(providerId.trim());
        if (!spec) {
          return {
            ok: false,
            code: "unknown_provider",
            available: CONNECTOR_SPECS.map((entry) => entry.providerId),
          };
        }
        return runConnectorOperation({
          workspaceId: organizationId,
          providerId: spec.providerId,
          operationId: operationId.trim(),
          userId: userId ?? null,
        });
      },
    }),

    describeConnector: tool({
      description:
        "Explain one connector precisely: the exact credential the tenant must provide, where it comes from, available read operations, why writes are unavailable, and real blockers.",
      inputSchema: z.object({ providerId: z.string() }),
      execute: async ({ providerId }) => {
        const spec = getConnectorSpec(providerId.trim());
        if (!spec) {
          return {
            error: `no connector for ${providerId}`,
            available: CONNECTOR_SPECS.map((entry) => entry.providerId),
          };
        }
        return {
          providerId: spec.providerId,
          label: spec.label,
          labelAr: spec.labelAr,
          credentialType: spec.credentialType,
          credentialHintEn: spec.credentialHintEn,
          credentialHintAr: spec.credentialHintAr,
          readOperations: spec.operations
            .filter((op) => op.kind === "read")
            .map((op) => ({ id: op.id, en: op.titleEn, ar: op.titleAr })),
          writeStatus: spec.writeStatus,
          blockers: spec.blockers,
          scopes: spec.scopes,
          docsUrl: spec.docsUrl,
          connectUrl: `https://zooka-ai.com/settings/integrations#${spec.providerId}`,
        };
      },
    }),
  };
}
