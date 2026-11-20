import { describe, expect, test } from "vitest";

import {
  createAccessToken,
  isValidRoomSlug,
  readLiveConfig,
  roomNameFor,
  verifyAccessToken,
} from "@/lib/live/token";

const secret = "test-secret-not-a-real-credential";

describe("live config", () => {
  test("is not configured when any value is missing", () => {
    expect(readLiveConfig({})).toEqual({
      configured: false,
      reason: "live_not_configured",
    });
    expect(
      readLiveConfig({
        LIVEKIT_URL: "wss://example.invalid",
        LIVEKIT_API_KEY: "key",
      }),
    ).toEqual({ configured: false, reason: "live_not_configured" });
  });

  test("is configured only with all three values", () => {
    expect(
      readLiveConfig({
        LIVEKIT_URL: "wss://example.invalid",
        LIVEKIT_API_KEY: "key",
        LIVEKIT_API_SECRET: "secret",
      }),
    ).toEqual({
      configured: true,
      url: "wss://example.invalid",
      apiKey: "key",
      apiSecret: "secret",
    });
  });
});

describe("room naming", () => {
  test("always carries the workspace prefix", () => {
    expect(roomNameFor("org-1", "standup")).toBe("ws_org-1__standup");
  });

  test("rejects a slug that could escape the namespace", () => {
    expect(isValidRoomSlug("../../other")).toBe(false);
    expect(isValidRoomSlug("Room With Spaces")).toBe(false);
    expect(() => roomNameFor("org-1", "bad slug")).toThrow("room_slug_invalid");
  });

  test("refuses to build a room without a workspace", () => {
    expect(() => roomNameFor("  ", "standup")).toThrow("room_requires_workspace");
  });
});

describe("access token", () => {
  const token = createAccessToken({
    apiKey: "test-key",
    apiSecret: secret,
    room: "ws_org-1__standup",
    identity: "user-1",
    name: "Helmy",
    now: 1_700_000_000,
  });

  test("is signed and verifiable", () => {
    const claims = verifyAccessToken(token.token, secret);
    expect(claims.iss).toBe("test-key");
    expect(claims.sub).toBe("user-1");
    expect(claims.name).toBe("Helmy");
    expect(claims.video).toEqual({
      room: "ws_org-1__standup",
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
  });

  test("cannot be verified with another secret", () => {
    expect(() => verifyAccessToken(token.token, "another-secret")).toThrow(
      "token_signature_invalid",
    );
  });

  test("expires within the allowed window", () => {
    expect(token.expiresAt).toBe(1_700_000_000 + 3600);
    const claims = verifyAccessToken(token.token, secret);
    expect(Number(claims.exp)).toBe(token.expiresAt);
  });

  test("refuses to sign without credentials", () => {
    expect(() =>
      createAccessToken({ apiKey: "", apiSecret: "", room: "r", identity: "i" }),
    ).toThrow("live_credentials_missing");
  });
});
