import { describe, expect, test } from "vitest";

import {
  getOAuthClientConfig,
  isOAuthProviderId,
  isOAuthProviderConfigured,
  OAUTH_PROVIDERS,
} from "../../lib/integrations/oauth/config";

const ORIGIN = "https://zooka-ai.com";

describe("oauth provider registry", () => {
  test("meta and linkedin are first-class providers, not pasted tokens", () => {
    expect(isOAuthProviderId("meta")).toBe(true);
    expect(isOAuthProviderId("linkedin")).toBe(true);
    expect(isOAuthProviderId("instagram")).toBe(false);
    expect(OAUTH_PROVIDERS.meta.scopes).toContain("instagram_content_publish");
    expect(OAUTH_PROVIDERS.linkedin.scopes).toContain("w_member_social");
  });

  test("meta reads the existing Facebook Login app variables", () => {
    const previous = {
      id: process.env.FACEBOOK_LOGIN_CLIENT_ID,
      secret: process.env.FACEBOOK_LOGIN_CLIENT_SECRET,
      metaId: process.env.META_CLIENT_ID,
    };
    process.env.FACEBOOK_LOGIN_CLIENT_ID = "fb-app-id";
    process.env.FACEBOOK_LOGIN_CLIENT_SECRET = "fb-app-secret";
    delete process.env.META_CLIENT_ID;
    try {
      const config = getOAuthClientConfig("meta", ORIGIN);
      expect(config?.clientId).toBe("fb-app-id");
      expect(config?.redirectUri).toBe(
        "https://zooka-ai.com/api/integrations/meta/callback"
      );
      expect(isOAuthProviderConfigured("meta")).toBe(true);
    } finally {
      const restore = (key: string, value: string | undefined) => {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      };
      restore("FACEBOOK_LOGIN_CLIENT_ID", previous.id);
      restore("FACEBOOK_LOGIN_CLIENT_SECRET", previous.secret);
      restore("META_CLIENT_ID", previous.metaId);
    }
  });

  test("linkedin stays fail-closed while its client credentials are absent", () => {
    const id = process.env.LINKEDIN_CLIENT_ID;
    const secret = process.env.LINKEDIN_CLIENT_SECRET;
    delete process.env.LINKEDIN_CLIENT_ID;
    delete process.env.LINKEDIN_CLIENT_SECRET;
    try {
      expect(getOAuthClientConfig("linkedin", ORIGIN)).toBeNull();
      expect(isOAuthProviderConfigured("linkedin")).toBe(false);
    } finally {
      if (id !== undefined) process.env.LINKEDIN_CLIENT_ID = id;
      if (secret !== undefined) process.env.LINKEDIN_CLIENT_SECRET = secret;
    }
  });

  test("form-encoded providers are declared, JSON ones are not broken", () => {
    expect(OAUTH_PROVIDERS.meta.tokenBody).toBe("form");
    expect(OAUTH_PROVIDERS.linkedin.tokenBody).toBe("form");
    expect(OAUTH_PROVIDERS.github.tokenBody).toBe("json");
    expect(OAUTH_PROVIDERS.x.tokenBody).toBe("json");
  });
});
