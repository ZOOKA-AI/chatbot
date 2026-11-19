import { tool } from "ai";
import { z } from "zod";
import { getN8nCredentials } from "@/lib/integrations/n8n/store";

/**
 * Lets the agent hand work to the workspace's OWN n8n instance: the user pastes
 * their server URL and API key in Settings, and every automation stays on their
 * infrastructure. Nothing here talks to any shared or platform-owned n8n.
 */
export function createN8nTools(organizationId: string) {
  return {
    runN8nWorkflow: tool({
      description:
        "Trigger a workflow on the workspace's own n8n server through its webhook path (for example \"/webhook/my-flow\"). Use it when the user asks to run, start or publish something through their n8n automation.",
      inputSchema: z.object({
        webhookPath: z
          .string()
          .describe(
            "Webhook path as configured in the user's n8n workflow, e.g. /webhook/zooka-publish"
          ),
        payload: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("JSON body to send to the workflow"),
      }),
      execute: async ({
        webhookPath,
        payload,
      }: {
        webhookPath: string;
        payload?: Record<string, unknown>;
      }) => {
        const credentials = await getN8nCredentials(organizationId);
        if (!credentials) {
          return {
            ok: false,
            error:
              "No n8n connection for this workspace. Ask the user to connect their own n8n server in Settings, Integrations.",
          };
        }
        const path = webhookPath.startsWith("/") ? webhookPath : `/${webhookPath}`;
        const url = `${credentials.baseUrl}${path}`;
        try {
          const response = await fetch(url, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "X-N8N-API-KEY": credentials.apiKey,
            },
            body: JSON.stringify(payload ?? {}),
            cache: "no-store",
            signal: AbortSignal.timeout(20_000),
          });
          const text = (await response.text()).slice(0, 1200);
          return { ok: response.ok, status: response.status, body: text, url };
        } catch {
          return { ok: false, error: "unreachable", url };
        }
      },
    }),
  };
}
