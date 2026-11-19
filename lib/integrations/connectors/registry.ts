import "server-only";

import { AD_CONNECTOR_SPECS } from "@/lib/integrations/connectors/ads-registry";
import {
  type ConnectorSpec,
  requireFields,
  splitCredential,
} from "@/lib/integrations/connectors/types";

/**
 * The nine connectors requested for the SaaS release, each described once.
 * Every operation here is a read. Writes (posting, sending, spending) are
 * deliberately absent: rule 8 forbids publishing or spending without explicit
 * owner approval, so a provider without an approved write path says so in
 * writeStatus instead of exposing a button that cannot keep its promise.
 */

function text(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === "string" && value ? value : null;
}

function nested(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

const CORE_CONNECTOR_SPECS: ConnectorSpec[] = [
  {
    providerId: "slack",
    label: "Slack",
    labelAr: "سلاك",
    credentialType: "token",
    credentialHintEn: "Bot token from your Slack app (xoxb-…)",
    credentialHintAr: "توكن البوت من تطبيق سلاك (xoxb-…)",
    parse: (raw) => ({ token: raw.trim() }),
    auth: { kind: "bearer" },
    verify: { method: "POST", url: () => "https://slack.com/api/auth.test" },
    describe: (payload) => {
      if (payload.ok !== true) {
        throw new Error(String(payload.error ?? "slack rejected the token"));
      }
      return {
        accountId: text(payload, "team_id"),
        accountName: text(payload, "team"),
        extra: {
          slackUserId: text(payload, "user_id"),
          slackUser: text(payload, "user"),
        },
      };
    },
    operations: [
      {
        id: "list_channels",
        titleEn: "List public channels",
        titleAr: "سرد القنوات العامة",
        kind: "read",
        method: "GET",
        url: () =>
          "https://slack.com/api/conversations.list?limit=100&exclude_archived=true&types=public_channel",
        collectionPath: "channels",
        docsUrl: "https://api.slack.com/methods/conversations.list",
      },
      {
        id: "team_info",
        titleEn: "Read workspace info",
        titleAr: "قراءة معلومات المساحة",
        kind: "read",
        method: "GET",
        url: () => "https://slack.com/api/team.info",
        docsUrl: "https://api.slack.com/methods/team.info",
      },
    ],
    blockers: [
      "A Slack app must be created in the tenant's own workspace and installed to mint the bot token.",
    ],
    scopes: ["channels:read", "team:read", "chat:write"],
    docsUrl: "https://api.slack.com/authentication/token-types",
    writeStatus:
      "Sending messages is not implemented: it needs a per-tenant approval step and is excluded from this release.",
  },
  {
    providerId: "notion",
    label: "Notion",
    labelAr: "نوشن",
    credentialType: "oauth",
    credentialHintEn: "Internal integration secret (secret_… or ntn_…)",
    credentialHintAr: "سر التكامل الداخلي (secret_… أو ntn_…)",
    parse: (raw) => ({ token: raw.trim() }),
    auth: {
      kind: "headers",
      headers: {
        Authorization: "Bearer {token}",
        "Notion-Version": "2022-06-28",
      },
    },
    verify: { method: "GET", url: () => "https://api.notion.com/v1/users/me" },
    describe: (payload) => {
      const bot = nested(payload, "bot");
      const owner = nested(bot, "owner");
      return {
        accountId: text(payload, "id"),
        accountName: text(payload, "name") ?? text(payload, "type"),
        extra: {
          notionType: text(payload, "type"),
          notionWorkspace: text(owner, "workspace") ?? null,
        },
      };
    },
    operations: [
      {
        id: "search",
        titleEn: "Search shared pages",
        titleAr: "البحث في الصفحات المشاركة",
        kind: "read",
        method: "POST",
        url: () => "https://api.notion.com/v1/search",
        body: () => JSON.stringify({ page_size: 20 }),
        contentType: "application/json",
        collectionPath: "results",
        docsUrl: "https://developers.notion.com/reference/post-search",
      },
    ],
    blockers: [
      "A Notion integration must be created in the tenant's workspace and each page shared with it.",
    ],
    scopes: ["read_content"],
    docsUrl: "https://developers.notion.com/docs/authorization",
    writeStatus:
      "Creating or editing pages is not implemented in this release; reads only.",
  },
  {
    providerId: "twilio",
    label: "Twilio",
    labelAr: "تويلو",
    credentialType: "token",
    credentialHintEn: "Account SID and Auth Token, pasted as ACCOUNT_SID:AUTH_TOKEN",
    credentialHintAr: "Account SID وAuth Token بصيغة ACCOUNT_SID:AUTH_TOKEN",
    parse: (raw) => {
      const [sid, token] = splitCredential(raw, ":");
      return requireFields({ sid: sid ?? "", token: token ?? "" }, [
        "sid",
        "token",
      ]);
    },
    auth: { kind: "basic", userField: "sid" },
    verify: {
      method: "GET",
      url: (f) =>
        `https://api.twilio.com/2010-04-01/Accounts/${f.sid}.json`,
    },
    describe: (payload) => {
      if (!text(payload, "sid")) {
        throw new Error(String(payload.message ?? "twilio rejected the credential"));
      }
      return {
        accountId: text(payload, "sid"),
        accountName: text(payload, "friendly_name"),
        extra: { twilioStatus: text(payload, "status") },
      };
    },
    operations: [
      {
        id: "list_numbers",
        titleEn: "List phone numbers",
        titleAr: "سرد أرقام الهاتف",
        kind: "read",
        method: "GET",
        url: (f) =>
          `https://api.twilio.com/2010-04-01/Accounts/${f.sid}/IncomingPhoneNumbers.json?PageSize=20`,
        collectionPath: "incoming_phone_numbers",
        docsUrl:
          "https://www.twilio.com/docs/phone-numbers/api/incomingphonenumber-resource",
      },
    ],
    blockers: [
      "SMS sending requires a verified sender and A2P registration in the tenant's own account.",
    ],
    scopes: ["read"],
    docsUrl: "https://www.twilio.com/docs/usage/api",
    writeStatus:
      "Sending SMS or placing calls is excluded: no write path without explicit owner approval.",
  },
  {
    providerId: "shopify",
    label: "Shopify",
    labelAr: "شوبيفاي",
    credentialType: "oauth",
    credentialHintEn: "Admin API token and store domain, pasted as TOKEN|store.myshopify.com",
    credentialHintAr: "توكن Admin API ونطاق المتجر بصيغة TOKEN|store.myshopify.com",
    parse: (raw) => {
      const [token, shop] = splitCredential(raw);
      const host = (shop ?? "").replace(/^https?:\/\//, "").replace(/\/$/, "");
      return requireFields({ token: token ?? "", shop: host }, ["token", "shop"]);
    },
    auth: { kind: "headers", headers: { "X-Shopify-Access-Token": "{token}" } },
    verify: {
      method: "GET",
      url: (f) => `https://${f.shop}/admin/api/2024-10/shop.json`,
    },
    describe: (payload) => {
      const shop = nested(payload, "shop");
      if (!text(shop, "domain")) {
        throw new Error("shopify returned no shop for this token");
      }
      return {
        accountId: text(shop, "domain"),
        accountName: text(shop, "name"),
        extra: {
          shopDomain: text(shop, "myshopify_domain"),
          shopEmail: text(shop, "email"),
        },
      };
    },
    operations: [
      {
        id: "list_products",
        titleEn: "List products",
        titleAr: "سرد المنتجات",
        kind: "read",
        method: "GET",
        url: (f) => `https://${f.shop}/admin/api/2024-10/products.json?limit=10`,
        collectionPath: "products",
        docsUrl: "https://shopify.dev/docs/api/admin-rest",
      },
      {
        id: "count_orders",
        titleEn: "Count orders",
        titleAr: "عدّ الطلبات",
        kind: "read",
        method: "GET",
        url: (f) =>
          `https://${f.shop}/admin/api/2024-10/orders/count.json?status=any`,
        docsUrl: "https://shopify.dev/docs/api/admin-rest",
      },
    ],
    blockers: [
      "A custom app must be installed in the tenant's store to mint the Admin API token.",
    ],
    scopes: ["read_products", "read_orders"],
    docsUrl: "https://shopify.dev/docs/apps/auth/admin-app-access-tokens",
    writeStatus:
      "Product and order changes are not implemented; reads only in this release.",
  },
  {
    providerId: "tiktok",
    label: "TikTok",
    labelAr: "تيك توك",
    credentialType: "oauth",
    credentialHintEn: "TikTok user access token (from Login Kit)",
    credentialHintAr: "توكن وصول مستخدم تيك توك (من Login Kit)",
    parse: (raw) => ({ token: raw.trim() }),
    auth: { kind: "bearer" },
    verify: {
      method: "GET",
      url: () =>
        "https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,display_name,username,avatar_url,follower_count",
    },
    describe: (payload) => {
      const error = nested(payload, "error");
      const code = text(error, "code");
      if (code && code !== "ok") {
        throw new Error(text(error, "message") ?? code);
      }
      const user = nested(nested(payload, "data"), "user");
      if (!text(user, "open_id")) {
        throw new Error("tiktok returned no user for this token");
      }
      return {
        accountId: text(user, "open_id"),
        accountName: text(user, "display_name") ?? text(user, "username"),
        extra: {
          tiktokUsername: text(user, "username"),
          followerCount: user.follower_count ?? null,
        },
      };
    },
    operations: [
      {
        id: "profile",
        titleEn: "Read profile",
        titleAr: "قراءة الملف",
        kind: "read",
        method: "GET",
        url: () =>
          "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,username,follower_count,following_count,likes_count,video_count",
        collectionPath: "data",
        docsUrl: "https://developers.tiktok.com/doc/tiktok-api-v2-get-user-info",
      },
    ],
    blockers: [
      "user.info.basic must be granted on the token, and the app needs the redirect URI registered on this domain plus review for direct posting.",
    ],
    scopes: ["user.info.basic"],
    docsUrl: "https://developers.tiktok.com/doc/content-posting-api-get-started",
    writeStatus:
      "Publishing is excluded. The verified route stays the inbox draft the owner finishes in the app.",
  },
  {
    providerId: "whatsapp",
    label: "WhatsApp Business",
    labelAr: "واتساب للأعمال",
    credentialType: "oauth",
    credentialHintEn: "Phone number id and system-user token, pasted as PHONE_NUMBER_ID|TOKEN",
    credentialHintAr: "معرّف الرقم وتوكن مستخدم النظام بصيغة PHONE_NUMBER_ID|TOKEN",
    parse: (raw) => {
      const [phoneNumberId, token] = splitCredential(raw);
      return requireFields(
        { phoneNumberId: phoneNumberId ?? "", token: token ?? "" },
        ["phoneNumberId", "token"]
      );
    },
    auth: { kind: "bearer" },
    verify: {
      method: "GET",
      url: (f) =>
        `https://graph.facebook.com/v21.0/${f.phoneNumberId}?fields=id,verified_name,display_phone_number,quality_rating`,
    },
    describe: (payload) => {
      if (!text(payload, "id")) {
        throw new Error(
          String(nested(payload, "error").message ?? "whatsapp rejected the credential")
        );
      }
      return {
        accountId: text(payload, "id"),
        accountName:
          text(payload, "verified_name") ?? text(payload, "display_phone_number"),
        extra: {
          waNumber: text(payload, "display_phone_number"),
          qualityRating: text(payload, "quality_rating"),
        },
      };
    },
    operations: [
      {
        id: "phone_number",
        titleEn: "Read the phone number",
        titleAr: "قراءة الرقم",
        kind: "read",
        method: "GET",
        url: (f) =>
          `https://graph.facebook.com/v21.0/${f.phoneNumberId}?fields=id,verified_name,display_phone_number,quality_rating,platform_type`,
        docsUrl: "https://developers.facebook.com/docs/whatsapp/cloud-api",
      },
      {
        id: "list_templates",
        titleEn: "List message templates",
        titleAr: "سرد قوالب الرسائل",
        kind: "read",
        method: "GET",
        url: (f) =>
          `https://graph.facebook.com/v21.0/${f.phoneNumberId}/message_templates?limit=20`,
        collectionPath: "data",
        docsUrl:
          "https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates",
      },
    ],
    blockers: [
      "The tenant needs an approved WhatsApp Business Account with a verified number assigned to the app that issued the token.",
    ],
    scopes: ["whatsapp_business_messaging"],
    docsUrl: "https://developers.facebook.com/docs/whatsapp/cloud-api",
    writeStatus:
      "Sending messages is excluded from this release; it needs an approved WABA and explicit approval per send.",
  },
  {
    providerId: "x",
    label: "X (Twitter)",
    labelAr: "إكس (تويتر)",
    credentialType: "oauth",
    credentialHintEn: "X user access token (OAuth 2.0)",
    credentialHintAr: "توكن وصول مستخدم إكس (OAuth 2.0)",
    parse: (raw) => ({ token: raw.trim() }),
    auth: { kind: "bearer" },
    verify: { method: "GET", url: () => "https://api.x.com/2/users/me" },
    describe: (payload) => {
      const data = nested(payload, "data");
      if (!text(data, "id")) {
        throw new Error("x returned no user for this token");
      }
      return {
        accountId: text(data, "id"),
        accountName: text(data, "username") ?? text(data, "name"),
        extra: { xUserId: text(data, "id"), xName: text(data, "name") },
      };
    },
    operations: [
      {
        id: "me",
        titleEn: "Read profile",
        titleAr: "قراءة الملف",
        kind: "read",
        method: "GET",
        url: () => "https://api.x.com/2/users/me?user.fields=public_metrics",
        docsUrl: "https://developer.x.com/en/docs/x-api/users/lookup",
      },
      {
        id: "recent_posts",
        titleEn: "Read recent posts",
        titleAr: "قراءة آخر المنشورات",
        kind: "read",
        method: "GET",
        url: (f) =>
          `https://api.x.com/2/users/${f.xUserId ?? "me"}/tweets?max_results=5`,
        collectionPath: "data",
        docsUrl: "https://developer.x.com/en/docs/x-api/tweets/timelines",
      },
    ],
    blockers: [
      "One-click OAuth needs X_CLIENT_ID and X_CLIENT_SECRET on the deployment; a tenant token works without them.",
    ],
    scopes: ["tweet.read", "users.read"],
    docsUrl: "https://developer.x.com/en/docs/authentication/oauth-2-0",
    writeStatus:
      "Posting is excluded: publish actions need explicit owner approval and are not wired.",
  },
  {
    providerId: "cloudflare",
    label: "Cloudflare",
    labelAr: "كلاودفلير",
    credentialType: "token",
    credentialHintEn: "Cloudflare API token (Zone:Read + DNS:Edit as needed)",
    credentialHintAr: "توكن Cloudflare API (Zone:Read وDNS:Edit حسب الحاجة)",
    parse: (raw) => ({ token: raw.trim() }),
    auth: { kind: "bearer" },
    verify: {
      method: "GET",
      url: () => "https://api.cloudflare.com/client/v4/user/tokens/verify",
    },
    describe: (payload) => {
      const result = nested(payload, "result");
      if (payload.success !== true || !text(result, "id")) {
        throw new Error("cloudflare rejected the token");
      }
      return {
        accountId: text(result, "id"),
        accountName: `Cloudflare token (${text(result, "status") ?? "unknown"})`,
        extra: { cfTokenStatus: text(result, "status") },
      };
    },
    operations: [
      {
        id: "list_zones",
        titleEn: "List zones (domains)",
        titleAr: "سرد النطاقات",
        kind: "read",
        method: "GET",
        url: () => "https://api.cloudflare.com/client/v4/zones?per_page=20",
        collectionPath: "result",
        docsUrl: "https://developers.cloudflare.com/api/operations/zones-get",
      },
    ],
    blockers: [
      "A Cloudflare API token must be minted in the tenant's dashboard with Zone:Read at minimum.",
    ],
    scopes: ["zone:read"],
    docsUrl: "https://developers.cloudflare.com/fundamentals/api/get-started/create-token/",
    writeStatus:
      "DNS changes are excluded from this release; reads only.",
  },
  {
    providerId: "namecheap",
    label: "Namecheap",
    labelAr: "نيم تشيب",
    credentialType: "token",
    credentialHintEn: "API user and key, pasted as API_USER|API_KEY",
    credentialHintAr: "مستخدم API والمفتاح بصيغة API_USER|API_KEY",
    parse: (raw) => {
      const [user, key] = splitCredential(raw);
      return requireFields({ user: user ?? "", key: key ?? "" }, ["user", "key"]);
    },
    auth: { kind: "query", params: { ApiUser: "{user}", ApiKey: "{key}" } },
    verify: {
      method: "GET",
      url: (f) =>
        `https://api.namecheap.com/xml.response?ApiUser=${encodeURIComponent(f.user)}&ApiKey=${encodeURIComponent(f.key)}&UserName=${encodeURIComponent(f.user)}&ClientIp=127.0.0.1&Command=namecheap.users.getBalances`,
    },
    describe: (payload) => {
      const status = String(payload["@status"] ?? "");
      if (status && status !== "OK") {
        throw new Error("namecheap rejected the credential");
      }
      return {
        accountId: null,
        accountName: "Namecheap API",
        extra: {},
      };
    },
    operations: [
      {
        id: "list_domains",
        titleEn: "List domains",
        titleAr: "سرد النطاقات",
        kind: "read",
        method: "GET",
        url: (f) =>
          `https://api.namecheap.com/xml.response?ApiUser=${encodeURIComponent(f.user)}&ApiKey=${encodeURIComponent(f.key)}&UserName=${encodeURIComponent(f.user)}&ClientIp=127.0.0.1&Command=namecheap.domains.getList&PageSize=20`,
        responseKind: "text",
        docsUrl: "https://www.namecheap.com/support/api/methods/domains/get-list/",
      },
    ],
    blockers: [
      "Namecheap only answers requests from client IPs on the account allowlist, so this connector stays off until the egress IP is added in the tenant's dashboard.",
      "The client IP must be sent explicitly; Namecheap rejects a placeholder with error 1011100.",
    ],
    scopes: ["domains:read"],
    docsUrl: "https://www.namecheap.com/support/api/",
    writeStatus:
      "DNS changes are excluded from this release; reads only, and only after the IP allowlist step.",
  },
];

/**
 * The registry is the union of the core connectors and the advertising/CRM set.
 * Both are declared as data, so the executor, the matrix and the agent read the
 * same list and a new provider never needs its own network code.
 */
export const CONNECTOR_SPECS: ConnectorSpec[] = [
  ...CORE_CONNECTOR_SPECS,
  ...AD_CONNECTOR_SPECS,
];

const INDEX = new Map(CONNECTOR_SPECS.map((spec) => [spec.providerId, spec]));

export function getConnectorSpec(providerId: string) {
  return INDEX.get(providerId) ?? null;
}

export function connectorProviderIds() {
  return CONNECTOR_SPECS.map((spec) => spec.providerId);
}
