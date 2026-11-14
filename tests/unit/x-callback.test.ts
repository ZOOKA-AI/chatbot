import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "signed-state" }) }),
}));
vi.mock("@/lib/integrations/oauth/state", () => ({
  oauthStateCookieName: () => "oauth_state_x",
  readOAuthState: () => ({
    organizationId: "organization",
    codeVerifier: "verifier",
  }),
}));
vi.mock("@/lib/integrations/oauth/store", () => ({
  saveOAuthConnection: vi.fn(),
}));
vi.mock("@/lib/integrations/oauth/config", () => ({
  getOAuthStateSecret: () => "state-secret",
  OAUTH_PROVIDERS: {},
}));

import { GET } from "@/app/api/integrations/x/callback/route";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test("X code exchange authenticates with Basic instead of a form secret", async () => {
  vi.stubEnv("X_CLIENT_ID", "client-id");
  vi.stubEnv("X_CLIENT_SECRET", "client-secret");
  const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
    assert.equal(
      new Headers(init.headers).get("authorization"),
      `Basic ${Buffer.from("client-id:client-secret").toString("base64")}`
    );
    const body = init.body as URLSearchParams;
    assert.equal(body.get("client_id"), "client-id");
    assert.equal(body.has("client_secret"), false);
    assert.equal(body.get("code"), "code");
    assert.equal(body.get("code_verifier"), "verifier");
    assert.equal(body.get("grant_type"), "authorization_code");
    assert.equal(
      body.get("redirect_uri"),
      "https://zooka-ai.com/api/integrations/x/callback"
    );
    return new Response(null, { status: 400 });
  });
  vi.stubGlobal("fetch", fetcher);

  const response = await GET(
    new Request("https://zooka-ai.com/api/integrations/x/callback?code=code&state=state")
  );
  assert.equal(fetcher.mock.calls.length, 1);
  assert.equal(
    response.headers.get("location"),
    "https://zooka-ai.com/settings/integrations?x=token_failed"
  );
});
