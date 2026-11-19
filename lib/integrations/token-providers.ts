import "server-only";

import {
  CONNECTOR_TOKEN_PROVIDERS,
  type ConnectorTokenProviderId,
} from "@/lib/integrations/connectors/token-specs";

/**
 * Providers that are connected by pasting a long-lived access token instead of
 * running an OAuth dance (their OAuth app is not registered with us yet, or the
 * account is a business/page token). Nothing here is trusted on faith: the
 * connect route calls `validateUrl` with the pasted token and only reports the
 * integration as connected when the provider returns a real account.
 */
export type BespokeTokenProviderId =
  | "instagram"
  | "meta"
  | "linkedin"
  | "snapchat"
  | "telegram_ads"
  | "telegram_bot"
  | "improvmx"
  | "ryze"
  | "stripe"
  | "supabase";

/**
 * Every provider the secure card can accept a credential for: the bespoke ones
 * built earlier plus the declarative connectors (Slack, Notion, Twilio, Shopify,
 * TikTok, WhatsApp, X, Cloudflare) whose validation lives with their spec.
 */
export type TokenProviderId = BespokeTokenProviderId | ConnectorTokenProviderId;

export type TokenProviderDefinition = {
  id: TokenProviderId;
  label: string;
  tokenHint: string;
  /** Static endpoint, or one built from the token (Telegram puts it in the path). */
  validateUrl: string | ((token: string) => string);
  /** Defaults to GET; POST providers also supply validateBody. */
  validateMethod?: "GET" | "POST";
  validateBody?: (token: string) => string;
  auth: (token: string) => Record<string, string>;
  describe: (payload: Record<string, unknown>) => {
    accountId: string | null;
    accountName: string | null;
    /** Values persisted next to the token (e.g. the Instagram account id). */
    extra: Record<string, unknown>;
  };
  scopes: string[];
  docsUrl: string;
};

const GRAPH = "https://graph.facebook.com/v21.0";

function asString(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

const BESPOKE_TOKEN_PROVIDERS: Record<
  BespokeTokenProviderId,
  TokenProviderDefinition
> = {
    instagram: {
      id: "instagram",
      label: "Instagram",
      tokenHint: "Instagram / Facebook page access token",
      validateUrl: `${GRAPH}/me?fields=id,name,username,instagram_business_account{id,username}`,
      auth: (token) => ({ Authorization: `Bearer ${token}` }),
      describe: (payload) => {
        const raw = payload.instagram_business_account;
        const ig =
          raw && typeof raw === "object"
            ? (raw as Record<string, unknown>)
            : undefined;
        const igUserId = asString(ig?.id);
        const igHandle = asString(ig?.username);
        const ownHandle = asString(payload.username);
        const pageName = asString(payload.name);
        const handle = igHandle ?? ownHandle ?? pageName;
        const isHandle = Boolean(igHandle ?? ownHandle);
        return {
          accountId: igUserId ?? asString(payload.id),
          accountName: handle
            ? isHandle
              ? `@${handle.replace(/^@/, "")}`
              : handle
            : null,
          extra: {
            igUserId: igUserId ?? (ownHandle ? asString(payload.id) : null),
            pageId: asString(payload.id),
            handle: igHandle ?? ownHandle,
          },
        };
      },
      scopes: [
        "instagram_basic",
        "instagram_content_publish",
        "pages_show_list",
        "pages_read_engagement",
      ],
      docsUrl:
        "https://developers.facebook.com/docs/instagram-platform/content-publishing",
    },
    meta: {
      id: "meta",
      label: "Facebook page",
      tokenHint: "Facebook page access token",
      validateUrl: `${GRAPH}/me?fields=id,name,fan_count,followers_count,link`,
      auth: (token) => ({ Authorization: `Bearer ${token}` }),
      describe: (payload) => {
        const pageName = asString(payload.name);
        return {
          accountId: asString(payload.id),
          accountName: pageName,
          extra: {
            pageId: asString(payload.id),
            pageName,
          },
        };
      },
      scopes: [
        "pages_show_list",
        "pages_read_engagement",
        "pages_manage_posts",
      ],
      docsUrl: "https://developers.facebook.com/docs/pages-api/posts",
    },
    linkedin: {
      id: "linkedin",
      label: "LinkedIn",
      tokenHint: "LinkedIn member access token",
      validateUrl: "https://api.linkedin.com/v2/userinfo",
      auth: (token) => ({ Authorization: `Bearer ${token}` }),
      describe: (payload) => {
        const name = asString(payload.name);
        return {
          accountId: asString(payload.sub),
          accountName: name,
          extra: {
            memberId: asString(payload.sub),
            email: asString(payload.email),
          },
        };
      },
      scopes: ["openid", "profile", "email", "w_member_social"],
      docsUrl: "https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api",
    },
    snapchat: {
      id: "snapchat",
      label: "Snapchat",
      tokenHint:
        "Snap Marketing API token, as access_token or access_token|refresh_token",
      validateUrl: "https://adsapi.snapchat.com/v1/me/organizations",
      // The connect form accepts "access_token|refresh_token"; only the access
      // half belongs in the Authorization header.
      auth: (token) => ({
        Authorization: `Bearer ${token.split("|")[0].trim()}`,
      }),
      describe: (payload) => {
        const rows = Array.isArray(payload.organizations)
          ? (payload.organizations as Record<string, unknown>[])
          : [];
        const organization = rows
          .map(
            (row) =>
              (row as { organization?: Record<string, unknown> }).organization
          )
          .filter((value): value is Record<string, unknown> => Boolean(value))[0];
        return {
          accountId: organization && typeof organization.id === "string"
            ? organization.id
            : null,
          accountName:
            organization && typeof organization.name === "string"
              ? organization.name
              : null,
          extra: {
            organizationId:
              organization && typeof organization.id === "string"
                ? organization.id
                : null,
          },
        };
      },
      scopes: ["snapchat-marketing-api"],
      docsUrl: "https://marketingapi.snapchat.com/docs/",
    },
    telegram_ads: {
      id: "telegram_ads",
      label: "Telegram Ads",
      tokenHint: "Promote API token from ads.telegram.org → API",
      validateUrl: "https://promoteapi.telegram.org/getCurrentAccount",
      auth: (token) => ({ Authorization: `Bearer ${token.trim()}` }),
      describe: (payload) => {
        const account =
          (payload.result as Record<string, unknown> | undefined) ?? {};
        return {
          accountId:
            typeof account.account_id === "string" ? account.account_id : null,
          accountName: typeof account.title === "string" ? account.title : null,
          extra: {
            currency: typeof account.currency === "string" ? account.currency : null,
          },
        };
      },
      scopes: ["telegram-ads-api"],
      docsUrl: "https://ads.telegram.org/docs/api",
    },
    telegram_bot: {
      id: "telegram_bot",
      label: "Telegram Bot",
      tokenHint: "Bot token from @BotFather",
      validateUrl: (token) =>
        `https://api.telegram.org/bot${token.trim()}/getMe`,
      auth: () => ({}),
      describe: (payload) => {
        const bot =
          (payload.result as Record<string, unknown> | undefined) ?? {};
        const id =
          typeof bot.id === "number" || typeof bot.id === "string"
            ? String(bot.id)
            : null;
        const username = asString(bot.username);
        const firstName = asString(bot.first_name);
        return {
          accountId: id,
          accountName: username ? `@${username}` : firstName,
          extra: { botName: firstName, botUsername: username },
        };
      },
      scopes: ["telegram-bot-api"],
      docsUrl: "https://core.telegram.org/bots/api",
    },
    improvmx: {
      id: "improvmx",
      label: "ImprovMX email routing",
      tokenHint: "ImprovMX API key (sk_…)",
      validateUrl: "https://api.improvmx.com/v3/domains/",
      // ImprovMX documents HTTP Basic with the API key as the password and an
      // empty username: base64(":" + key). Sending the raw key after "Basic "
      // made every valid key look rejected.
      auth: (token) => ({
        Authorization: `Basic ${Buffer.from(`:${token.trim()}`).toString("base64")}`,
      }),
      describe: (payload) => {
        const domains = Array.isArray(payload.domains)
          ? (payload.domains as unknown[])
          : [];
        const first = (domains[0] as Record<string, unknown> | undefined) ?? {};
        const domain = asString(first.domain);
        return {
          accountId: domain,
          accountName: domain ? `${domain} email routing` : null,
          extra: {
            domains: domains
              .map((row) => asString((row as Record<string, unknown>).domain))
              .filter((value): value is string => Boolean(value)),
          },
        };
      },
      scopes: ["improvmx-api"],
      docsUrl: "https://improvmx.com/api",
    },
    ryze: {
      id: "ryze",
      label: "Ryze Ads",
      tokenHint: "Ryze OAuth refresh token",
      validateUrl: "https://connector.get-ryze.ai/token",
      validateMethod: "POST",
      validateBody: (token) =>
        new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: token.trim(),
          client_id: process.env.RYZE_CLIENT_ID ?? "",
        }).toString(),
      auth: () => ({}),
      describe: (payload) => {
        const access = asString(payload.access_token);
        return {
          accountId: null,
          accountName: access ? "Ryze Ads" : null,
          extra: {},
        };
      },
      scopes: ["ryze-mcp"],
      docsUrl: "https://get-ryze.ai",
    },
    stripe: {
      id: "stripe",
      label: "Stripe",
      tokenHint:
        "Stripe secret or restricted key (sk_… / rk_…). Use a read-only restricted key.",
      validateUrl: "https://api.stripe.com/v1/account",
      auth: (token) => ({ Authorization: `Bearer ${token.trim()}` }),
      describe: (payload) => {
        const id = asString(payload.id);
        if (!id) {
          throw new Error("stripe returned no account id");
        }
        const dashboard =
          (payload.settings as Record<string, unknown> | undefined)?.dashboard;
        const displayName =
          dashboard && typeof dashboard === "object"
            ? asString((dashboard as Record<string, unknown>).display_name)
            : null;
        const business = payload.business_profile;
        const businessName =
          business && typeof business === "object"
            ? asString((business as Record<string, unknown>).name)
            : null;
        return {
          accountId: id,
          accountName: displayName ?? businessName ?? id,
          extra: {
            country: asString(payload.country),
            currency: asString(payload.default_currency),
            livemode: payload.id?.toString().startsWith("acct_") ?? null,
          },
        };
      },
      scopes: ["read_only"],
      docsUrl: "https://docs.stripe.com/keys#create-restricted-api-secret-key",
    },
    supabase: {
      id: "supabase",
      label: "Supabase",
      tokenHint: "Supabase personal access token (sbp_…)",
      validateUrl: "https://api.supabase.com/v1/projects",
      auth: (token) => ({ Authorization: `Bearer ${token.trim()}` }),
      describe: (raw) => {
        // /v1/projects answers with a bare array, and the two call sites hand
        // the parsed body over as-is, so accept the array shape directly.
        const payload = raw as unknown;
        const rows = Array.isArray(payload)
          ? (payload as Record<string, unknown>[])
          : Array.isArray((payload as Record<string, unknown>).projects)
            ? ((payload as Record<string, unknown>).projects as Record<string, unknown>[])
            : Array.isArray((payload as Record<string, unknown>).value)
              ? ((payload as Record<string, unknown>).value as Record<string, unknown>[])
              : [];
        const first = rows[0] ?? {};
        const ref = asString(first.id) ?? asString(first.ref);
        return {
          accountId: ref,
          accountName:
            rows.length > 0
              ? `Supabase (${rows.length} ${rows.length === 1 ? "project" : "projects"})`
              : "Supabase (no projects)",
          extra: {
            projects: rows.length,
            region: asString(first.region),
          },
        };
      },
      scopes: ["projects:read"],
      docsUrl: "https://supabase.com/docs/reference/api/introduction",
    },
  };

export const TOKEN_PROVIDERS: Record<TokenProviderId, TokenProviderDefinition> =
  {
    ...BESPOKE_TOKEN_PROVIDERS,
    ...CONNECTOR_TOKEN_PROVIDERS,
  } as Record<TokenProviderId, TokenProviderDefinition>;

export function isTokenProviderId(value: string): value is TokenProviderId {
  return Object.prototype.hasOwnProperty.call(TOKEN_PROVIDERS, value);
}
