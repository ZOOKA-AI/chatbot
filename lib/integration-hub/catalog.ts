export const hubStates = [
  "NOT CONFIGURED",
  "CONFIGURED",
  "CONNECTED",
  "VERIFIED",
  "ERROR",
  "EXPIRED",
] as const;
export type HubState = (typeof hubStates)[number];
export interface HubProvider {
  id: string;
  name: string;
  category: string;
  auth: string;
  docs: string;
  description: string;
  canTest: boolean;
  scopes: string[];
  configure: string;
}
const settings = "/settings/integrations";
export const hubProviders: HubProvider[] = [
  {
    id: "github",
    name: "GitHub",
    category: "Developer Tools",
    auth: "OAuth / encrypted workspace token",
    docs: "https://docs.github.com/en/rest/users/users",
    description:
      "Read identity, code and issues. Writes require separate approval.",
    canTest: true,
    scopes: ["read:user", "repo (only if repository access needed)"],
    configure: settings,
  },
  {
    id: "vercel",
    name: "Vercel",
    category: "Developer Tools",
    auth: "OAuth / encrypted workspace token",
    docs: "https://vercel.com/docs/rest-api/user/get-the-user",
    description:
      "Verify the connected user, not deployment or billing permissions.",
    canTest: true,
    scopes: ["integration-defined scopes"],
    configure: settings,
  },
  {
    id: "x",
    name: "X",
    category: "Social Media",
    auth: "OAuth 2.0",
    docs: "https://docs.x.com/x-api/users/get-me",
    description:
      "Verify profile access. Posting entitlement is not certified by identity checks.",
    canTest: true,
    scopes: ["users.read", "tweet.read", "tweet.write (publishing only)"],
    configure: settings,
  },
  {
    id: "google_drive",
    name: "Google Drive",
    category: "Cloud Storage",
    auth: "OAuth 2.0",
    docs: "https://developers.google.com/drive/api/reference/rest/v3/files/list",
    description: "Test a minimal file-list read; file data is discarded.",
    canTest: true,
    scopes: ["drive.readonly"],
    configure: settings,
  },
  {
    id: "gmail",
    name: "Gmail",
    category: "Email",
    auth: "OAuth 2.0",
    docs: "https://developers.google.com/workspace/gmail/api/reference/rest/v1/users/getProfile",
    description:
      "Test profile access. This does not send mail or verify send permission.",
    canTest: true,
    scopes: ["gmail.readonly", "gmail.send (sending only)"],
    configure: settings,
  },
  {
    id: "google_calendar",
    name: "Google Calendar",
    category: "Productivity",
    auth: "OAuth 2.0",
    docs: "https://developers.google.com/workspace/calendar/api/v3/reference/events/list",
    description: "Test primary-calendar read. No event is created or modified.",
    canTest: true,
    scopes: ["calendar.events"],
    configure: settings,
  },
  {
    id: "n8n",
    name: "n8n",
    category: "Automation",
    auth: "Workspace API key",
    docs: "https://docs.n8n.io/api/authentication/",
    description:
      "Existing encrypted connector. Self-hosted endpoint verification requires network/SSRF review; this Hub does not probe arbitrary URLs.",
    canTest: false,
    scopes: ["dedicated workflow account"],
    configure: settings,
  },
  {
    id: "openai",
    name: "OpenAI",
    category: "AI Models",
    auth: "Server API key / Gateway",
    docs: "https://ai-sdk.dev/providers/ai-sdk-providers/openai",
    description:
      "Existing chat uses Gateway routing; direct workspace OpenAI connector is not implemented.",
    canTest: false,
    scopes: ["model entitlement and budget"],
    configure: settings,
  },
  {
    id: "gemini",
    name: "Google Gemini",
    category: "AI Models",
    auth: "Server API key / Gateway",
    docs: "https://ai.google.dev/gemini-api/docs",
    description:
      "Model routing exists; workspace-specific model credential storage is not implemented.",
    canTest: false,
    scopes: ["model entitlement and budget"],
    configure: settings,
  },
  {
    id: "anthropic",
    name: "Anthropic",
    category: "AI Models",
    auth: "Server API key / Gateway",
    docs: "https://docs.anthropic.com/",
    description:
      "Gateway model routing is separate from a direct Anthropic API key.",
    canTest: false,
    scopes: ["model entitlement and budget"],
    configure: settings,
  },
  {
    id: "gateway_image",
    name: "Gateway Images",
    category: "Image Generation",
    auth: "Server Gateway + private Blob",
    docs: "https://vercel.com/docs/ai-gateway/modalities/image-generation/ai-sdk",
    description:
      "Owner-only one-image pilot; a paid generation is never triggered by Test Connection.",
    canTest: false,
    scopes: ["inference budget", "private asset storage"],
    configure: "/creative#image-generation",
  },
  {
    id: "replicate",
    name: "Replicate",
    category: "Image Generation",
    auth: "Server API token",
    docs: "https://replicate.com/docs/",
    description: "Discovery candidate; no workspace connector installed.",
    canTest: false,
    scopes: ["model-specific access and cost review"],
    configure: settings,
  },
  {
    id: "fal",
    name: "fal.ai",
    category: "Video Generation",
    auth: "Server API key",
    docs: "https://fal.ai/docs/documentation",
    description:
      "Discovery candidate; video/model cost and callback contract require review.",
    canTest: false,
    scopes: ["model-specific access and cost review"],
    configure: settings,
  },
  {
    id: "stability",
    name: "Stability AI",
    category: "Image Generation",
    auth: "Server bearer key",
    docs: "https://docs.stability.ai/api-reference/index",
    description:
      "Discovery candidate; no background-removal connector installed.",
    canTest: false,
    scopes: ["model-specific access and cost review"],
    configure: settings,
  },
  {
    id: "cloudinary",
    name: "Cloudinary",
    category: "Cloud Storage",
    auth: "Server credentials / OAuth",
    docs: "https://cloudinary.com/documentation/image_generation_api_reference",
    description:
      "Discovery candidate; signed upload and media product access need implementation.",
    canTest: false,
    scopes: ["media_generation for the generation product"],
    configure: settings,
  },
  {
    id: "supabase",
    name: "Supabase",
    category: "Databases",
    auth: "Server PostgreSQL connection",
    docs: "https://supabase.com/docs/guides/database/connecting-to-postgres",
    description:
      "The app database is not a user-managed Supabase OAuth connector. Hub never reveals database credentials.",
    canTest: false,
    scopes: ["least-privilege database role"],
    configure: settings,
  },
  {
    id: "google_analytics",
    name: "Google Analytics",
    category: "Analytics",
    auth: "OAuth",
    docs: "https://developers.google.com/analytics/devguides/reporting/data/v1",
    description: "A website tracking tag is not a reporting API connection.",
    canTest: false,
    scopes: ["analytics.readonly (reporting)"],
    configure: settings,
  },
  {
    id: "facebook",
    name: "Facebook",
    category: "Social Media",
    auth: "Meta approved OAuth",
    docs: "https://developers.facebook.com/docs/pages-api/",
    description:
      "Legacy server publishing is separate; safe multi-tenant Hub publishing is not enabled.",
    canTest: false,
    scopes: ["selected Page permissions and app review"],
    configure: settings,
  },
  {
    id: "instagram",
    name: "Instagram",
    category: "Social Media",
    auth: "Meta approved OAuth",
    docs: "https://developers.facebook.com/docs/instagram-platform/",
    description:
      "Requires an eligible account and publication authorization; no automatic claim of connection.",
    canTest: false,
    scopes: ["product-specific publishing permission and app review"],
    configure: settings,
  },
  {
    id: "tiktok",
    name: "TikTok",
    category: "Social Media",
    auth: "OAuth + app review",
    docs: "https://developers.tiktok.com/doc/getting-started-create-an-app",
    description: "No live posting connector installed in the Hub.",
    canTest: false,
    scopes: ["video.publish after approved product access"],
    configure: settings,
  },
  {
    id: "youtube",
    name: "YouTube",
    category: "Social Media",
    auth: "Google OAuth",
    docs: "https://developers.google.com/youtube/v3",
    description: "Upload and quota/audit workflow not implemented here.",
    canTest: false,
    scopes: ["youtube.upload (only for publishing)"],
    configure: settings,
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    category: "Social Media",
    auth: "OAuth + product access",
    docs: "https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access",
    description:
      "Personal and organization publishing require distinct permissions.",
    canTest: false,
    scopes: ["w_member_social or reviewed organization permissions"],
    configure: settings,
  },
  {
    id: "pinterest",
    name: "Pinterest",
    category: "Social Media",
    auth: "OAuth",
    docs: "https://developers.pinterest.com/docs/api/v5/introduction/",
    description: "Discovery candidate; no Pin publisher installed.",
    canTest: false,
    scopes: ["review the current boards/pins permissions"],
    configure: settings,
  },
  {
    id: "telegram",
    name: "Telegram",
    category: "Messaging",
    auth: "Bot token",
    docs: "https://core.telegram.org/bots/api",
    description:
      "Discovery candidate. A bot token is not a personal user login.",
    canTest: false,
    scopes: ["bot/chat permissions"],
    configure: settings,
  },
  {
    id: "whatsapp",
    name: "WhatsApp Business",
    category: "Messaging",
    auth: "Meta server credentials",
    docs: "https://developers.facebook.com/docs/whatsapp/cloud-api/",
    description:
      "Existing server webhook/reply path, not per-workspace verified onboarding.",
    canTest: false,
    scopes: ["business onboarding and messaging permissions"],
    configure: settings,
  },
  {
    id: "stripe",
    name: "Stripe",
    category: "Payments",
    auth: "Server restricted key",
    docs: "https://docs.stripe.com/api",
    description:
      "Platform billing is not permission to operate a customer's Stripe account.",
    canTest: false,
    scopes: ["separate merchant authorization required"],
    configure: settings,
  },
];
export interface Verification {
  state: "VERIFIED" | "ERROR" | "EXPIRED";
  checkedAt: string;
  fingerprint: string;
  code: string;
}
export function connectionState(input: {
  configured: boolean;
  stored: boolean;
  expired: boolean;
  fingerprint: string;
  verification?: Verification | null;
  now?: number;
}): HubState {
  if (input.expired) {
    return "EXPIRED";
  }
  if (!input.stored) {
    return input.configured ? "CONFIGURED" : "NOT CONFIGURED";
  }
  const v = input.verification;
  const now = input.now ?? Date.now();
  if (
    v &&
    v.fingerprint === input.fingerprint &&
    now - Date.parse(v.checkedAt) >= 0 &&
    now - Date.parse(v.checkedAt) < 15 * 60 * 1000
  ) {
    return v.state;
  }
  return "CONFIGURED";
}
