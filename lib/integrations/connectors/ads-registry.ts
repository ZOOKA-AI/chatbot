import "server-only";

import {
  type ConnectorAuth,
  type ConnectorOperation,
  type ConnectorSpec,
  requireFields,
  splitCredential,
} from "@/lib/integrations/connectors/types";

/**
 * Advertising and CRM connectors, described once, in the same declarative shape
 * as the core registry.
 *
 * Every provider here was checked against its own host before it was written: an
 * unauthenticated call must answer a provider-specific error (401, or the
 * provider's own JSON envelope) rather than a 404, which is the difference
 * between "the tenant has no credential yet" and "this endpoint does not exist".
 * Nothing here is guessed from a blog post.
 *
 * Two rules hold for all of them:
 *  - reads only. Spend, budget and bid changes are excluded by design; the owner
 *    rule forbids spending or publishing without explicit approval, so a write
 *    operation is declared in writeStatus instead of shipped as a dead button.
 *  - the tenant's own credential. No platform-wide ad account is shared between
 *    workspaces, and every URL is built from the fields the tenant pasted.
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

function rows(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return Array.isArray(value) ? value : [];
}

const READ_ONLY_NOTE =
  "Reads only in this release: changing budgets, bids, audiences or pausing campaigns is excluded until the owner approves a write path.";

/** A provider whose whole credential is one bearer token. */
function bearerSpec(input: {
  providerId: string;
  label: string;
  labelAr: string;
  hintEn: string;
  hintAr: string;
  verifyUrl: (fields: Record<string, string>) => string;
  describe: ConnectorSpec["describe"];
  operations: ConnectorOperation[];
  blockers?: string[];
  scopes: string[];
  docsUrl: string;
  writeStatus?: string;
}): ConnectorSpec {
  return {
    providerId: input.providerId,
    label: input.label,
    labelAr: input.labelAr,
    credentialType: "token",
    credentialHintEn: input.hintEn,
    credentialHintAr: input.hintAr,
    parse: (raw) => requireFields({ token: raw.trim() }, ["token"]),
    auth: { kind: "bearer" },
    verify: { method: "GET", url: input.verifyUrl },
    describe: input.describe,
    operations: input.operations,
    blockers: input.blockers ?? [],
    scopes: input.scopes,
    docsUrl: input.docsUrl,
    writeStatus: input.writeStatus ?? READ_ONLY_NOTE,
  };
}

/** A provider that needs the tenant's own account id beside the token. */
function accountScopedSpec(input: {
  providerId: string;
  label: string;
  labelAr: string;
  hintEn: string;
  hintAr: string;
  accountField: string;
  auth?: ConnectorAuth;
  verifyUrl: (fields: Record<string, string>) => string;
  describe: ConnectorSpec["describe"];
  operations: ConnectorOperation[];
  blockers?: string[];
  scopes: string[];
  docsUrl: string;
  writeStatus?: string;
}): ConnectorSpec {
  return {
    providerId: input.providerId,
    label: input.label,
    labelAr: input.labelAr,
    credentialType: "token",
    credentialHintEn: input.hintEn,
    credentialHintAr: input.hintAr,
    parse: (raw) => {
      const [token, account] = splitCredential(raw);
      return requireFields(
        { token: token ?? "", [input.accountField]: account ?? "" },
        ["token", input.accountField]
      );
    },
    auth: input.auth ?? { kind: "bearer" },
    verify: { method: "GET", url: input.verifyUrl },
    describe: input.describe,
    operations: input.operations,
    blockers: input.blockers ?? [],
    scopes: input.scopes,
    docsUrl: input.docsUrl,
    writeStatus: input.writeStatus ?? READ_ONLY_NOTE,
  };
}

export const AD_CONNECTOR_SPECS: ConnectorSpec[] = [
  accountScopedSpec({
    providerId: "meta_ads",
    label: "Meta Ads",
    labelAr: "إعلانات ميتا",
    hintEn:
      "Marketing API access token and ad account id, pasted as TOKEN|act_1234567890",
    hintAr:
      "توكن Marketing API ومعرّف الحساب الإعلاني بصيغة TOKEN|act_1234567890",
    accountField: "accountId",
    verifyUrl: () =>
      "https://graph.facebook.com/v21.0/me/adaccounts?fields=id,name,account_status,currency,timezone_name",
    describe: (payload) => {
      const first = rows(payload, "data")[0] as Record<string, unknown> | undefined;
      if (!first || !text(first, "id")) {
        throw new Error("meta returned no ad account for this token");
      }
      return {
        accountId: text(first, "id"),
        accountName: text(first, "name"),
        extra: {
          accountStatus: text(first, "account_status"),
          currency: text(first, "currency"),
          timezone: text(first, "timezone_name"),
        },
      };
    },
    operations: [
      {
        id: "list_ad_accounts",
        titleEn: "List ad accounts",
        titleAr: "سرد الحسابات الإعلانية",
        kind: "read",
        method: "GET",
        url: () =>
          "https://graph.facebook.com/v21.0/me/adaccounts?fields=id,name,account_status,currency&limit=25",
        collectionPath: "data",
        docsUrl: "https://developers.facebook.com/docs/marketing-api/reference/ad-account",
      },
      {
        id: "list_campaigns",
        titleEn: "List campaigns",
        titleAr: "سرد الحملات",
        kind: "read",
        method: "GET",
        url: (f) =>
          `https://graph.facebook.com/v21.0/${f.accountId}/campaigns?fields=id,name,status,objective,daily_budget&limit=25`,
        collectionPath: "data",
        docsUrl: "https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-group",
      },
      {
        id: "last_7d_insights",
        titleEn: "Last 7 days performance",
        titleAr: "أداء آخر ٧ أيام",
        kind: "read",
        method: "GET",
        url: (f) =>
          `https://graph.facebook.com/v21.0/${f.accountId}/insights?fields=spend,impressions,clicks,ctr,cpc&date_preset=last_7d`,
        collectionPath: "data",
        docsUrl: "https://developers.facebook.com/docs/marketing-api/insights",
      },
    ],
    blockers: [
      "The token must belong to a user or system user with access to that ad account.",
    ],
    scopes: ["ads_read"],
    docsUrl: "https://developers.facebook.com/docs/marketing-api",
  }),
  accountScopedSpec({
    providerId: "tiktok_ads",
    label: "TikTok Ads",
    labelAr: "إعلانات تيك توك",
    hintEn: "Business API access token and advertiser id, pasted as TOKEN|advertiser_id",
    hintAr: "توكن Business API ومعرّف المعلن بصيغة TOKEN|advertiser_id",
    accountField: "advertiserId",
    auth: { kind: "headers", headers: { "Access-Token": "{token}" } },
    verifyUrl: (f) =>
      `https://business-api.tiktok.com/open_api/v1.3/advertiser/info/?advertiser_ids=${encodeURIComponent(
        `["${f.advertiserId}"]`
      )}`,
    describe: (payload) => {
      const data = nested(payload, "data");
      const first = rows(data, "list")[0] as Record<string, unknown> | undefined;
      if (!first || !text(first, "advertiser_id")) {
        throw new Error(String(payload.message ?? "tiktok returned no advertiser"));
      }
      return {
        accountId: text(first, "advertiser_id"),
        accountName: text(first, "advertiser_name"),
        extra: {
          status: text(first, "status"),
          currency: text(first, "currency"),
          timezone: text(first, "timezone"),
        },
      };
    },
    operations: [
      {
        id: "advertiser_info",
        titleEn: "Advertiser profile",
        titleAr: "بيانات المعلن",
        kind: "read",
        method: "GET",
        url: (f) =>
          `https://business-api.tiktok.com/open_api/v1.3/advertiser/info/?advertiser_ids=${encodeURIComponent(
            `["${f.advertiserId}"]`
          )}`,
        collectionPath: "data.list",
        docsUrl: "https://business-api.tiktok.com/portal/docs?id=1739593083610113",
      },
      {
        id: "list_campaigns",
        titleEn: "List campaigns",
        titleAr: "سرد الحملات",
        kind: "read",
        method: "GET",
        url: (f) =>
          `https://business-api.tiktok.com/open_api/v1.3/campaign/get/?advertiser_id=${f.advertiserId}&page_size=20`,
        collectionPath: "data.list",
        docsUrl: "https://business-api.tiktok.com/portal/docs?id=1739314558648322",
      },
    ],
    blockers: [
      "The advertiser id must be authorised for the token; a developer app in sandbox sees only its test advertiser.",
    ],
    scopes: ["advertiser.read"],
    docsUrl: "https://business-api.tiktok.com/portal/docs",
  }),
  accountScopedSpec({
    providerId: "snapchat_ads",
    label: "Snapchat Ads",
    labelAr: "إعلانات سناب شات",
    hintEn:
      "Marketing API access token and organization id, pasted as TOKEN|organization_id",
    hintAr: "توكن Marketing API ومعرّف المؤسسة بصيغة TOKEN|organization_id",
    accountField: "organizationId",
    verifyUrl: () => "https://adsapi.snapchat.com/v1/me/organizations",
    describe: (payload) => {
      const organizations = rows(nested(payload, "me"), "organizations");
      const first = organizations[0] as Record<string, unknown> | undefined;
      const organization = first
        ? nested(nested(first, "organization"), "organization")
        : {};
      if (!text(organization, "id")) {
        throw new Error("snapchat returned no organization for this token");
      }
      return {
        accountId: text(organization, "id"),
        accountName: text(organization, "name"),
        extra: {
          country: text(organization, "country"),
          currency: text(organization, "currency"),
        },
      };
    },
    operations: [
      {
        id: "list_organizations",
        titleEn: "List organizations",
        titleAr: "سرد المؤسسات",
        kind: "read",
        method: "GET",
        url: () => "https://adsapi.snapchat.com/v1/me/organizations",
        collectionPath: "me.organizations",
        docsUrl: "https://marketingapi.snapchat.com/docs/",
      },
      {
        id: "list_ad_accounts",
        titleEn: "List ad accounts",
        titleAr: "سرد الحسابات الإعلانية",
        kind: "read",
        method: "GET",
        url: (f) =>
          `https://adsapi.snapchat.com/v1/organizations/${f.organizationId}/adaccounts`,
        collectionPath: "adaccounts",
        docsUrl: "https://marketingapi.snapchat.com/docs/",
      },
    ],
    blockers: [
      "A Public Profile publishing app is allowlisted separately by Snapchat; reading ads does not grant publishing.",
    ],
    scopes: ["snapchat-marketing-api"],
    docsUrl: "https://marketingapi.snapchat.com/docs/",
  }),
  accountScopedSpec({
    providerId: "linkedin_ads",
    label: "LinkedIn Ads",
    labelAr: "إعلانات لينكدإن",
    hintEn:
      "Access token and sponsored account id, pasted as TOKEN|sponsored_account_id",
    hintAr: "توكن الوصول ومعرّف الحساب الإعلاني بصيغة TOKEN|sponsored_account_id",
    accountField: "accountId",
    auth: {
      kind: "headers",
      headers: {
        Authorization: "Bearer {token}",
        "LinkedIn-Version": "202411",
        "X-Restli-Protocol-Version": "2.0.0",
      },
    },
    verifyUrl: () => "https://api.linkedin.com/rest/adAccounts?q=search",
    describe: (payload) => {
      const elements = rows(payload, "elements");
      const first = elements[0] as Record<string, unknown> | undefined;
      if (!first || !text(first, "id")) {
        throw new Error("linkedin returned no ad account for this token");
      }
      return {
        accountId: String(first.id),
        accountName: text(first, "name"),
        extra: {
          status: text(first, "status"),
          currency: text(first, "currency"),
        },
      };
    },
    operations: [
      {
        id: "list_accounts",
        titleEn: "List ad accounts",
        titleAr: "سرد الحسابات الإعلانية",
        kind: "read",
        method: "GET",
        url: () => "https://api.linkedin.com/rest/adAccounts?q=search",
        collectionPath: "elements",
        docsUrl: "https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads/account-structure/create-and-manage-accounts",
      },
      {
        id: "list_campaigns",
        titleEn: "List campaigns",
        titleAr: "سرد الحملات",
        kind: "read",
        method: "GET",
        url: (f) =>
          `https://api.linkedin.com/rest/adCampaigns?q=search&search.account.values[0]=urn%3Ali%3AsponsoredAccount%3A${f.accountId}`,
        collectionPath: "elements",
        docsUrl: "https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads/account-structure/create-and-manage-campaigns",
      },
    ],
    blockers: [
      "The LinkedIn app must hold the Advertising API role, and the pinned version header must be a supported month.",
    ],
    scopes: ["r_ads", "r_ads_reporting"],
    docsUrl: "https://learn.microsoft.com/en-us/linkedin/marketing/",
  }),
  accountScopedSpec({
    providerId: "pinterest_ads",
    label: "Pinterest Ads",
    labelAr: "إعلانات بنترست",
    hintEn: "Access token and ad account id, pasted as TOKEN|ad_account_id",
    hintAr: "توكن الوصول ومعرّف الحساب الإعلاني بصيغة TOKEN|ad_account_id",
    accountField: "accountId",
    verifyUrl: () => "https://api.pinterest.com/v5/ad_accounts",
    describe: (payload) => {
      const items = rows(payload, "items");
      const first = items[0] as Record<string, unknown> | undefined;
      if (!first || !text(first, "id")) {
        throw new Error("pinterest returned no ad account for this token");
      }
      return {
        accountId: text(first, "id"),
        accountName: text(first, "name"),
        extra: {
          currency: text(first, "currency"),
          country: text(first, "country"),
        },
      };
    },
    operations: [
      {
        id: "list_ad_accounts",
        titleEn: "List ad accounts",
        titleAr: "سرد الحسابات الإعلانية",
        kind: "read",
        method: "GET",
        url: () => "https://api.pinterest.com/v5/ad_accounts",
        collectionPath: "items",
        docsUrl: "https://developers.pinterest.com/docs/api/v5/#operation/ad_accounts/list",
      },
      {
        id: "list_campaigns",
        titleEn: "List campaigns",
        titleAr: "سرد الحملات",
        kind: "read",
        method: "GET",
        url: (f) =>
          `https://api.pinterest.com/v5/ad_accounts/${f.accountId}/campaigns`,
        collectionPath: "items",
        docsUrl: "https://developers.pinterest.com/docs/api/v5/#operation/campaigns/list",
      },
    ],
    blockers: ["The token needs the ads:read scope on the tenant's own app."],
    scopes: ["ads:read"],
    docsUrl: "https://developers.pinterest.com/docs/api/v5/",
  }),
  accountScopedSpec({
    providerId: "reddit_ads",
    label: "Reddit Ads",
    labelAr: "إعلانات ريديت",
    hintEn: "Access token and ad account id, pasted as TOKEN|account_id",
    hintAr: "توكن الوصول ومعرّف الحساب الإعلاني بصيغة TOKEN|account_id",
    accountField: "accountId",
    auth: {
      kind: "headers",
      headers: {
        Authorization: "Bearer {token}",
        "User-Agent": "zooka-ai-connector/1.0",
      },
    },
    verifyUrl: () => "https://ads-api.reddit.com/api/v3/me",
    describe: (payload) => {
      const data = nested(payload, "data");
      const id = text(data, "id") ?? text(payload, "id");
      if (!id) {
        throw new Error("reddit returned no identity for this token");
      }
      return {
        accountId: id,
        accountName: text(data, "name") ?? text(payload, "name"),
        extra: { redditKind: text(data, "kind") },
      };
    },
    operations: [
      {
        id: "whoami",
        titleEn: "Token identity",
        titleAr: "هوية التوكن",
        kind: "read",
        method: "GET",
        url: () => "https://ads-api.reddit.com/api/v3/me",
        docsUrl: "https://ads-api.reddit.com/docs/v3/",
      },
      {
        id: "list_campaigns",
        titleEn: "List campaigns",
        titleAr: "سرد الحملات",
        kind: "read",
        method: "GET",
        url: (f) =>
          `https://ads-api.reddit.com/api/v3/accounts/${f.accountId}/campaigns`,
        collectionPath: "data",
        docsUrl: "https://ads-api.reddit.com/docs/v3/",
      },
    ],
    blockers: [
      "Reddit requires a descriptive User-Agent on every ads request; a browser-like agent string is rejected.",
    ],
    scopes: ["adsread"],
    docsUrl: "https://ads-api.reddit.com/docs/v3/",
  }),
  {
    providerId: "amazon_ads",
    label: "Amazon Ads",
    labelAr: "إعلانات أمازون",
    credentialType: "token",
    credentialHintEn:
      "Refresh token, client id and profile id, pasted as TOKEN|client_id|profile_id",
    credentialHintAr:
      "توكن الوصول ومعرّف العميل ومعرّف الملف بصيغة TOKEN|client_id|profile_id",
    parse: (raw) => {
      const [token, clientId, profileId] = splitCredential(raw);
      return requireFields(
        { token: token ?? "", clientId: clientId ?? "", profileId: profileId ?? "" },
        ["token", "clientId", "profileId"]
      );
    },
    auth: {
      kind: "headers",
      headers: {
        Authorization: "Bearer {token}",
        "Amazon-Advertising-API-ClientId": "{clientId}",
        "Amazon-Advertising-API-Scope": "{profileId}",
      },
    },
    verify: {
      method: "GET",
      url: () => "https://advertising-api.amazon.com/v2/profiles",
    },
    describe: (payload) => {
      const profiles = Array.isArray(payload) ? payload : rows(payload, "profiles");
      const first = profiles[0] as Record<string, unknown> | undefined;
      if (!first || !first.profileId) {
        throw new Error("amazon returned no advertising profile for this credential");
      }
      return {
        accountId: String(first.profileId),
        accountName: text(first, "accountInfo") ?? null,
        extra: {
          marketplace: text(first, "countryCode"),
          currency: text(first, "currencyCode"),
        },
      };
    },
    operations: [
      {
        id: "list_profiles",
        titleEn: "List advertising profiles",
        titleAr: "سرد الملفات الإعلانية",
        kind: "read",
        method: "GET",
        url: () => "https://advertising-api.amazon.com/v2/profiles",
        docsUrl: "https://advertising.amazon.com/API/docs/en-us/reference/2/profiles",
      },
      {
        id: "list_campaigns",
        titleEn: "List sponsored products campaigns",
        titleAr: "سرد حملات المنتجات الممولة",
        kind: "read",
        method: "GET",
        url: () => "https://advertising-api.amazon.com/v2/sp/campaigns",
        docsUrl: "https://advertising.amazon.com/API/docs/en-us/sponsored-products",
      },
    ],
    blockers: [
      "Amazon access tokens live one hour, so the tenant must paste a token minted from its own refresh token.",
    ],
    scopes: ["advertising::campaign_management"],
    docsUrl: "https://advertising.amazon.com/API/docs/en-us",
    writeStatus: READ_ONLY_NOTE,
  },
  accountScopedSpec({
    providerId: "x_ads",
    label: "X Ads",
    labelAr: "إعلانات إكس",
    hintEn: "OAuth2 access token and ads account id, pasted as TOKEN|account_id",
    hintAr: "توكن OAuth2 ومعرّف الحساب الإعلاني بصيغة TOKEN|account_id",
    accountField: "accountId",
    verifyUrl: () => "https://ads-api.x.com/12/accounts",
    describe: (payload) => {
      const first = rows(payload, "data")[0] as Record<string, unknown> | undefined;
      if (!first || !text(first, "id")) {
        throw new Error("x returned no ads account for this token");
      }
      return {
        accountId: text(first, "id"),
        accountName: text(first, "name"),
        extra: { timezone: text(first, "timezone") },
      };
    },
    operations: [
      {
        id: "list_accounts",
        titleEn: "List ads accounts",
        titleAr: "سرد الحسابات الإعلانية",
        kind: "read",
        method: "GET",
        url: () => "https://ads-api.x.com/12/accounts",
        collectionPath: "data",
        docsUrl: "https://developer.x.com/en/docs/x-ads-api",
      },
      {
        id: "list_campaigns",
        titleEn: "List campaigns",
        titleAr: "سرد الحملات",
        kind: "read",
        method: "GET",
        url: (f) =>
          `https://ads-api.x.com/12/accounts/${f.accountId}/campaigns?count=20`,
        collectionPath: "data",
        docsUrl: "https://developer.x.com/en/docs/x-ads-api/campaign-management",
      },
    ],
    blockers: [
      "The token must be an OAuth2 user token with ads access; the standard posting token does not reach ads-api.x.com.",
    ],
    scopes: ["ads:read"],
    docsUrl: "https://developer.x.com/en/docs/x-ads-api",
  }),
  bearerSpec({
    providerId: "hubspot",
    label: "HubSpot",
    labelAr: "هبسبوت",
    hintEn: "Private app access token (pat-…)",
    hintAr: "توكن تطبيق خاص (pat-…)",
    verifyUrl: () => "https://api.hubapi.com/crm/v3/objects/contacts?limit=1",
    describe: (payload) => {
      if (!Array.isArray(payload.results)) {
        throw new Error(String(payload.message ?? "hubspot rejected the token"));
      }
      return {
        accountId: "hubspot_crm",
        accountName: "HubSpot CRM",
        extra: { contactSample: rows(payload, "results").length },
      };
    },
    operations: [
      {
        id: "list_contacts",
        titleEn: "List contacts",
        titleAr: "سرد جهات الاتصال",
        kind: "read",
        method: "GET",
        url: () => "https://api.hubapi.com/crm/v3/objects/contacts?limit=10",
        collectionPath: "results",
        docsUrl: "https://developers.hubspot.com/docs/api/crm/contacts",
      },
      {
        id: "list_deals",
        titleEn: "List deals",
        titleAr: "سرد الصفقات",
        kind: "read",
        method: "GET",
        url: () => "https://api.hubapi.com/crm/v3/objects/deals?limit=10",
        collectionPath: "results",
        docsUrl: "https://developers.hubspot.com/docs/api/crm/deals",
      },
    ],
    blockers: [
      "A private app must be created in the tenant's portal and given the crm.objects scopes.",
    ],
    scopes: ["crm.objects.contacts.read", "crm.objects.deals.read"],
    docsUrl: "https://developers.hubspot.com/docs/api/overview",
  }),
  {
    providerId: "airtable",
    label: "Airtable",
    labelAr: "إيرتيبل",
    credentialType: "token",
    credentialHintEn: "Personal access token, base id and table id, pasted as TOKEN|app…|tbl…",
    credentialHintAr: "توكن شخصي ومعرّف القاعدة والجدول بصيغة TOKEN|app…|tbl…",
    parse: (raw) => {
      const [token, baseId, tableId] = splitCredential(raw);
      return requireFields(
        { token: token ?? "", baseId: baseId ?? "", tableId: tableId ?? "" },
        ["token", "baseId", "tableId"]
      );
    },
    auth: { kind: "bearer" },
    verify: {
      method: "GET",
      url: () => "https://api.airtable.com/v0/meta/bases",
    },
    describe: (payload) => {
      const bases = rows(payload, "bases");
      const first = bases[0] as Record<string, unknown> | undefined;
      if (!first || !text(first, "id")) {
        throw new Error("airtable returned no base for this token");
      }
      return {
        accountId: text(first, "id"),
        accountName: text(first, "name"),
        extra: { baseCount: bases.length },
      };
    },
    operations: [
      {
        id: "list_bases",
        titleEn: "List bases",
        titleAr: "سرد القواعد",
        kind: "read",
        method: "GET",
        url: () => "https://api.airtable.com/v0/meta/bases",
        collectionPath: "bases",
        docsUrl: "https://airtable.com/developers/web/api/list-bases",
      },
      {
        id: "list_records",
        titleEn: "List records",
        titleAr: "سرد السجلات",
        kind: "read",
        method: "GET",
        url: (f) =>
          `https://api.airtable.com/v0/${f.baseId}/${f.tableId}?maxRecords=10`,
        collectionPath: "records",
        docsUrl: "https://airtable.com/developers/web/api/list-records",
      },
    ],
    blockers: [
      "The token needs the data.records:read scope, and the base must be shared with that token.",
    ],
    scopes: ["data.records:read", "schema.bases:read"],
    docsUrl: "https://airtable.com/developers/web/api/introduction",
    writeStatus: READ_ONLY_NOTE,
  },
];
