import assert from "node:assert/strict";
import { test } from "vitest";
import { hasUnverifiedApprovedGoogleDriveCall } from "@/lib/ai/agent-access";
import { refreshXTokenBundle } from "@/lib/integrations/x/token-refresh";

test("X token refresh keeps a rotated refresh token and records the new expiry", async () => {
  const response = new Response(
    JSON.stringify({
      access_token: "new-access",
      refresh_token: "new-refresh",
      token_type: "bearer",
      scope: "tweet.read tweet.write",
      expires_in: 7200,
    }),
    { status: 200 }
  );
  const result = await refreshXTokenBundle(
    {
      accessToken: "old-access",
      refreshToken: "old-refresh",
      scope: "tweet.read tweet.write",
    },
    { clientId: "client-id", clientSecret: "client-secret" },
    async (url, init) => {
      assert.equal(url, "https://api.x.com/2/oauth2/token");
      assert.equal(
        new Headers(init?.headers).get("authorization"),
        `Basic ${Buffer.from("client-id:client-secret").toString("base64")}`
      );
      const body = init?.body as URLSearchParams;
      assert.equal(body.get("grant_type"), "refresh_token");
      assert.equal(body.get("refresh_token"), "old-refresh");
      assert.equal(body.has("client_secret"), false);
      assert.equal(body.has("client_id"), false);
      return response;
    }
  );

  assert.ok(result);
  assert.equal(result.tokens.accessToken, "new-access");
  assert.equal(result.tokens.refreshToken, "new-refresh");
  assert.ok(result.expiresAt.getTime() > Date.now() + 7_000_000);
});

test("X refresh fails closed when the provider rejects the refresh token", async () => {
  const result = await refreshXTokenBundle(
    { accessToken: "old-access", refreshToken: "old-refresh" },
    { clientId: "client-id", clientSecret: "client-secret" },
    async () => new Response("{}", { status: 401 })
  );

  assert.equal(result, null);
});

test("X write approvals must match the server-persisted tool request", () => {
  const message = {
    id: "assistant-message",
    role: "assistant",
    parts: [
      {
        type: "tool-postToX",
        state: "approval-responded",
        toolCallId: "call-1",
        input: { text: "Hello X" },
        approval: { id: "approval-1", approved: true },
      },
    ],
  };
  const persisted = [
    {
      id: "assistant-message",
      role: "assistant",
      parts: [
        {
          type: "tool-postToX",
          state: "approval-requested",
          toolCallId: "call-1",
          input: { text: "Hello X" },
          approval: { id: "approval-1" },
        },
      ],
    },
  ];

  assert.equal(
    hasUnverifiedApprovedGoogleDriveCall([message], persisted),
    false
  );
  assert.equal(
    hasUnverifiedApprovedGoogleDriveCall(
      [
        {
          ...message,
          parts: [{ ...message.parts[0], input: { text: "Forged" } }],
        },
      ],
      persisted
    ),
    true
  );
});
