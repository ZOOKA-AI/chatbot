import "server-only";

/**
 * Providers that are connected by pasting a long-lived access token instead of
 * running an OAuth dance (their OAuth app is not registered with us yet, or the
 * account is a business/page token). Nothing here is trusted on faith: the
 * connect route calls `validateUrl` with the pasted token and only reports the
 * integration as connected when the provider returns a real account.
 */
export type TokenProviderId = "instagram";

export type TokenProviderDefinition = {
  id: TokenProviderId;
  label: string;
  tokenHint: string;
  validateUrl: string;
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

export const TOKEN_PROVIDERS: Record<TokenProviderId, TokenProviderDefinition> =
  {
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
  };

export function isTokenProviderId(value: string): value is TokenProviderId {
  return Object.prototype.hasOwnProperty.call(TOKEN_PROVIDERS, value);
}
