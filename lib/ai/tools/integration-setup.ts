import { tool } from "ai";
import { z } from "zod";
import { checkIntegrationReadiness } from "@/lib/integrations/readiness";
import { getLiveIntegrationStatus } from "@/lib/integrations/live-status";
import { isGoogleDriveConfigured } from "@/lib/integrations/google-drive/server";
import {
  getPlaybook,
  INTEGRATION_PLAYBOOKS,
} from "@/lib/integrations/playbooks";
import { INTEGRATION_PROVIDERS } from "@/lib/integrations/providers";

const CONNECT_BASE = "https://zooka-ai.com/settings/integrations";

/**
 * Integration onboarding for any workspace: what exists, how to create the
 * account and credential from zero, where to paste it, and a live proof that a
 * connection actually answers.
 */
export function createIntegrationSetupTools(organizationId: string) {
  return {
    listIntegrationCatalog: tool({
      description:
        "List every integration the platform knows, with its catalog status, whether this workspace has a live verified connection, and whether a tenant can connect it self-serve.",
      inputSchema: z.object({}),
      execute: async () => {
        // Cheap status read only: the eight live verifier calls belong to
        // verifyIntegration for a single provider, not to a catalog listing.
        const status = await getLiveIntegrationStatus(organizationId, {
          googleConfigured: isGoogleDriveConfigured(),
        });
        return {
          count: INTEGRATION_PROVIDERS.length,
          integrations: INTEGRATION_PROVIDERS.map((provider) => {
            const playbook = getPlaybook(provider.id);
            return {
              id: provider.id,
              name: provider.name,
              status: provider.status,
              selfServe: playbook?.selfServe ?? false,
              connected: status.connected.has(provider.id),
              needsReconnect: status.needsReconnect.has(provider.id),
              hasPlaybook: Boolean(playbook),
            };
          }),
        };
      },
    }),

    getIntegrationPlaybook: tool({
      description:
        "Get the full from-zero setup recipe for one integration: prerequisites, where to create the account and the credential, which card to paste it into, how we verify it, and its known limits. Use this when a user asks how to connect something or wants an account created.",
      inputSchema: z.object({
        providerId: z
          .string()
          .describe(
            "Integration id, e.g. instagram, meta, linkedin, snapchat, telegram_ads, telegram_bot, improvmx, google_ads, x, whatsapp, tiktok, slack, notion, twilio, shopify, gmail, google_drive, google_calendar, github, vercel, supabase, stripe, n8n, google_maps."
          ),
      }),
      execute: async ({ providerId }) => {
        const playbook = getPlaybook(providerId.trim());
        if (!playbook) {
          return {
            error: `No playbook for "${providerId}".`,
            available: INTEGRATION_PLAYBOOKS.map((entry) => entry.providerId),
          };
        }
        return { ...playbook, connectUrl: `${CONNECT_BASE}#${playbook.providerId}` };
      },
    }),

    verifyIntegration: tool({
      description:
        "Run a live check on one integration for this workspace and report whether the provider actually answered, with the real data or the provider error.",
      inputSchema: z.object({
        providerId: z.string().describe("Integration id to verify."),
      }),
      execute: async ({ providerId }) => {
        return checkIntegrationReadiness(organizationId, providerId.trim());
      },
    }),

    getIntegrationConnectLink: tool({
      description:
        "Return the exact settings link a user must open to paste their credential, plus what to paste. Sending a link is safe; never ask a user to paste a secret into the chat.",
      inputSchema: z.object({
        providerId: z.string().describe("Integration id to connect."),
      }),
      execute: async ({ providerId }) => {
        const playbook = getPlaybook(providerId.trim());
        if (!playbook) {
          return { error: `No playbook for "${providerId}".` };
        }
        return {
          providerId: playbook.providerId,
          url: `${CONNECT_BASE}#${playbook.providerId}`,
          credential: playbook.credentialAr,
          credentialEn: playbook.credentialEn,
          selfServe: playbook.selfServe,
          note: playbook.selfServe
            ? "المستخدم يلصق الاعتماد في الكارت، ثم نشغّل فحصًا حيًّا للتأكيد."
            : "هذا المزوّد يحتاج خطوة على مستوى المنصة قبل أن يستطيع مستخدم ربطه.",
        };
      },
    }),
  };
}
