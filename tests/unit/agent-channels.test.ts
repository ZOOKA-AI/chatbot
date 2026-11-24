import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "vitest";

import {
  isValidExternalId,
  normalizeExternalId,
  parseChannelCredentials,
} from "@/lib/agent/channels/providers";
import { verifySlackSignature, verifyTelegramSecret } from "@/lib/agent/channels/verify";
import { sendChannelMessage } from "@/lib/agent/channels/send";

describe("channel sender normalisation", () => {
  it("strips the plus and spaces from a WhatsApp number", () => {
    assert.equal(normalizeExternalId("whatsapp", " +971 50 123 4567 "), "971501234567");
    assert.equal(isValidExternalId("whatsapp", "971501234567"), true);
    assert.equal(isValidExternalId("whatsapp", "12345"), false);
  });

  it("keeps the negative sign of a Telegram group chat id", () => {
    assert.equal(normalizeExternalId("telegram", " -1001234567890 "), "-1001234567890");
    assert.equal(isValidExternalId("telegram", "-1001234567890"), true);
    assert.equal(isValidExternalId("telegram", "abc"), false);
  });

  it("upper-cases a Slack channel id and rejects a short one", () => {
    assert.equal(normalizeExternalId("slack", " c01234567 "), "C01234567");
    assert.equal(isValidExternalId("slack", "C01234567"), true);
    assert.equal(isValidExternalId("slack", "C01"), false);
  });
});

describe("channel credentials", () => {
  it("accepts a complete Telegram secret", () => {
    assert.deepEqual(parseChannelCredentials("telegram", JSON.stringify({ token: "123:abc" })), { token: "123:abc", phoneNumberId: undefined });
  });

  it("requires phoneNumberId for WhatsApp", () => {
    assert.equal(parseChannelCredentials("whatsapp", JSON.stringify({ token: "t" })), null);
    assert.deepEqual(parseChannelCredentials("whatsapp", JSON.stringify({ token: "t", phoneNumberId: "1234" })), {
      token: "t",
      phoneNumberId: "1234",
    });
  });

  it("rejects anything that is not a complete JSON object", () => {
    assert.equal(parseChannelCredentials("slack", "not json"), null);
    assert.equal(parseChannelCredentials("slack", JSON.stringify({ token: "   " })), null);
    assert.equal(parseChannelCredentials("slack", JSON.stringify(null)), null);
  });
});

describe("telegram webhook authentication", () => {
  it("fails closed without a configured secret", () => {
    assert.equal(verifyTelegramSecret("anything", undefined), false);
    assert.equal(verifyTelegramSecret("anything", "short"), false);
  });

  it("accepts only the exact secret", () => {
    const secret = "0123456789abcdef0123";
    assert.equal(verifyTelegramSecret(secret, secret), true);
    assert.equal(verifyTelegramSecret("0123456789abcdef0124", secret), false);
    assert.equal(verifyTelegramSecret(null, secret), false);
  });
});

describe("slack signature verification", () => {
  const signingSecret = "8f742231b10e8888abcd99yyyzzz85a5";
  const rawBody = JSON.stringify({ type: "event_callback", event: { type: "message", text: "hi" } });

  function signed(timestamp: number) {
    return `v0=${createHmac("sha256", signingSecret).update(`v0:${timestamp}:${rawBody}`).digest("hex")}`;
  }

  it("accepts a fresh, correctly signed request", () => {
    const now = 1_700_000_000;
    assert.deepEqual(
      verifySlackSignature({ rawBody, timestamp: String(now), signature: signed(now), signingSecret, nowSeconds: now }),
      { ok: true }
    );
  });

  it("rejects a replayed request older than five minutes", () => {
    const now = 1_700_000_000;
    assert.deepEqual(
      verifySlackSignature({ rawBody, timestamp: String(now - 301), signature: signed(now - 301), signingSecret, nowSeconds: now }),
      { ok: false, reason: "stale_timestamp" }
    );
  });

  it("rejects a tampered body and a missing configuration", () => {
    const now = 1_700_000_000;
    assert.deepEqual(
      verifySlackSignature({ rawBody: `${rawBody} `, timestamp: String(now), signature: signed(now), signingSecret, nowSeconds: now }),
      { ok: false, reason: "bad_signature" }
    );
    assert.deepEqual(
      verifySlackSignature({ rawBody, timestamp: String(now), signature: signed(now), signingSecret: undefined, nowSeconds: now }),
      { ok: false, reason: "not_configured" }
    );
  });
});

describe("outbound send", () => {
  it("posts to the Telegram bot endpoint with the chat id", async () => {
    const calls: { url: string; body: string }[] = [];
    const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), body: String(init?.body ?? "") });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as unknown as typeof fetch;

    const result = await sendChannelMessage({
      provider: "telegram",
      credentials: { token: "123:abc" },
      externalId: "-100123",
      text: "مرحبا",
      fetchImpl: fakeFetch,
    });

    assert.equal(result.ok, true);
    assert.match(calls[0].url, /^https:\/\/api\.telegram\.org\/bot123:abc\/sendMessage$/);
    assert.equal(JSON.parse(calls[0].body).chat_id, "-100123");
  });

  it("refuses WhatsApp without a phone number id, before any request", async () => {
    let called = false;
    const fakeFetch = (async () => {
      called = true;
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    const result = await sendChannelMessage({
      provider: "whatsapp",
      credentials: { token: "t" },
      externalId: "971501234567",
      text: "hi",
      fetchImpl: fakeFetch,
    });

    assert.equal(result.ok, false);
    assert.equal(result.error, "missing_phone_number_id");
    assert.equal(called, false);
  });

  it("treats a Slack ok:false body as a failure", async () => {
    const fakeFetch = (async () => new Response(JSON.stringify({ ok: false, error: "channel_not_found" }), { status: 200 })) as unknown as typeof fetch;

    const result = await sendChannelMessage({
      provider: "slack",
      credentials: { token: "xoxb" },
      externalId: "C01234567",
      text: "hi",
      fetchImpl: fakeFetch,
    });

    assert.equal(result.ok, false);
    assert.equal(result.error, "channel_not_found");
  });
});
