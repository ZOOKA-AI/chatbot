import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { afterEach, test, vi } from "vitest";

const { afterCallback, claim, generate, model, capture } = vi.hoisted(() => ({
  afterCallback: vi.fn(),
  claim: vi.fn(),
  generate: vi.fn(),
  model: vi.fn(),
  capture: vi.fn(),
}));
vi.mock("next/server", async () => ({
  ...(await vi.importActual<typeof import("next/server")>("next/server")),
  after: afterCallback,
}));
vi.mock("@/lib/webhooks/events", () => ({ claimWebhookEvent: claim }));
vi.mock("@sentry/nextjs", () => ({ captureException: capture }));
vi.mock("ai", () => ({ generateText: generate }));
vi.mock("@/lib/ai/providers", () => ({ getLanguageModel: model }));

import {
  handleWhatsAppWebhook,
  verifyWhatsAppChallenge,
} from "@/lib/webhooks/whatsapp";
import {
  getIntegrationProviders,
  isWhatsAppConfigured,
} from "@/lib/integrations/providers";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
const body = JSON.stringify({
  entry: [
    {
      changes: [
        {
          value: {
            messages: [{ id: "test-delivery", text: { body: "test" } }],
          },
        },
      ],
    },
  ],
});
function request(signature?: string) {
  return new Request("https://example.test/api/webhooks/whatsapp", {
    method: "POST",
    body,
    headers: signature ? { "x-hub-signature-256": signature } : {},
  });
}
test("absent app secret fails closed even with an arbitrary signature", async () => {
  vi.stubEnv("WHATSAPP_APP_SECRET", "");
  assert.equal((await handleWhatsAppWebhook(request("forged"))).status, 503);
  assert.equal(afterCallback.mock.calls.length, 0);
  assert.equal(claim.mock.calls.length, 0);
});
test("missing and incorrect signatures cannot schedule processing", async () => {
  vi.stubEnv("WHATSAPP_APP_SECRET", "test-only-secret");
  assert.equal((await handleWhatsAppWebhook(request())).status, 401);
  assert.equal(
    (await handleWhatsAppWebhook(request("sha256=bad"))).status,
    401
  );
  assert.equal(afterCallback.mock.calls.length, 0);
});
test("correctly signed delivery schedules background processing", async () => {
  vi.stubEnv("WHATSAPP_APP_SECRET", "test-only-secret");
  const signature = `sha256=${createHmac("sha256", "test-only-secret").update(body).digest("hex")}`;
  assert.equal((await handleWhatsAppWebhook(request(signature))).status, 200);
  assert.equal(afterCallback.mock.calls.length, 1);
  // Do not run provider forwarding: this test checks admission only.
});
test("verification token still serves Meta setup challenge independently", async () => {
  vi.stubEnv("WHATSAPP_VERIFY_TOKEN", "test-verify-token");
  const response = await verifyWhatsAppChallenge(
    new Request(
      "https://example.test/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=test-verify-token&hub.challenge=test-challenge"
    )
  );
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "test-challenge");
});

function signedRequest(payload: unknown) {
  const raw = JSON.stringify(payload);
  const signature = `sha256=${createHmac("sha256", "test-only-secret").update(raw).digest("hex")}`;
  return new Request("https://example.test/api/webhooks/whatsapp", {
    method: "POST",
    body: raw,
    headers: { "x-hub-signature-256": signature },
  });
}

function delivery(messages: unknown[], phoneNumberId = "123") {
  return {
    entry: [{ changes: [{ value: { metadata: { phone_number_id: phoneNumberId }, messages } }] }],
  };
}

function setupReplies() {
  vi.stubEnv("WHATSAPP_APP_SECRET", "test-only-secret");
  vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "test-access-token");
  vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "123");
  vi.stubEnv("N8N_WHATSAPP_FORWARD_URL", "");
  claim.mockResolvedValue(true);
  model.mockReturnValue("model");
  generate.mockResolvedValue({ text: "Hello customer" });
  const send = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
  vi.stubGlobal("fetch", send);
  return send;
}

async function runBackground(payload: unknown) {
  const response = await handleWhatsAppWebhook(signedRequest(payload));
  assert.equal(response.status, 200);
  const callback = afterCallback.mock.calls.at(-1)?.[0];
  assert.ok(callback);
  await callback();
}

test("replies asynchronously to each verified text and ignores duplicates", async () => {
  const send = setupReplies();
  const seen = new Set<string>();
  claim.mockImplementation(async ({ externalId }) => {
    if (seen.has(externalId)) return false;
    seen.add(externalId);
    return true;
  });
  const payload = delivery([
    { id: "m1", from: "15550001", type: "text", text: { body: "Hi" } },
    { id: "m2", from: "15550002", type: "text", text: { body: "Hello" } },
  ]);
  const response = await handleWhatsAppWebhook(signedRequest(payload));
  assert.equal(response.status, 200);
  assert.equal(generate.mock.calls.length, 0);
  assert.equal(send.mock.calls.length, 0);
  await afterCallback.mock.calls[0][0]();
  await runBackground(payload);
  assert.equal(claim.mock.calls.length, 4);
  assert.equal(generate.mock.calls.length, 2);
  assert.equal(send.mock.calls.length, 2);
  assert.deepEqual(claim.mock.calls[0][0], {
    provider: "whatsapp-reply",
    externalId: "m1",
    payload: { id: "m1" },
    failClosed: true,
  });
  assert.equal(generate.mock.calls[0][0].prompt, "Hi");
  assert.equal(send.mock.calls[0][0], "https://graph.facebook.com/v21.0/123/messages");
  const options = send.mock.calls[0][1];
  assert.equal(options.method, "POST");
  assert.equal(options.headers.authorization, "Bearer " + "test-access-token");
  assert.deepEqual(JSON.parse(options.body), {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: "15550001",
    type: "text",
    text: { body: "Hello customer" },
  });
});

test("missing credentials log once and never claim or reply", async () => {
  const send = setupReplies();
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const payload = delivery([{ id: "m1", from: "15550001", type: "text", text: { body: "Hi" } }]);
  vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "");
  await runBackground(payload);
  vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "test-access-token");
  vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "");
  await runBackground(payload);
  assert.equal(warn.mock.calls.length, 1);
  assert.equal(claim.mock.calls.length, 0);
  assert.equal(generate.mock.calls.length, 0);
  assert.equal(send.mock.calls.length, 0);
  warn.mockRestore();
});

test("ignores status updates, non-text, incomplete, and other phone deliveries", async () => {
  const send = setupReplies();
  await runBackground(delivery([
    { id: "m1", from: "15550001", type: "image", text: { body: "caption" } },
    { id: "m2", type: "text", text: { body: "Hi" } },
    { id: "m3", from: "15550001", type: "text", text: { body: " " } },
  ]));
  await runBackground(delivery([{ id: "m4", from: "15550001", type: "text", text: { body: "Hi" } }], "different"));
  await runBackground({ entry: [{ changes: [{ value: { statuses: [{ id: "m1" }] } }] }] });
  assert.equal(claim.mock.calls.length, 0);
  assert.equal(send.mock.calls.length, 0);
});

test("claim failures and provider errors never send a duplicate or break acknowledgement", async () => {
  const send = setupReplies();
  const payload = delivery([{ id: "m1", from: "15550001", type: "text", text: { body: "Hi" } }]);
  claim.mockResolvedValueOnce(false);
  await runBackground(payload);
  assert.equal(generate.mock.calls.length, 0);
  send.mockResolvedValueOnce(new Response(null, { status: 500 }));
  await runBackground(payload);
  assert.equal(send.mock.calls.length, 1);
  assert.equal(capture.mock.calls.length, 1);
});

test("n8n forwarding retains its existing claim namespace", async () => {
  const send = setupReplies();
  vi.stubEnv("N8N_WHATSAPP_FORWARD_URL", "https://n8n.example.test/webhook");
  vi.stubEnv("N8N_WEBHOOK_SECRET", "test-n8n-secret");
  const payload = delivery([{ id: "m1", from: "15550001", type: "text", text: { body: "Hi" } }]);
  await runBackground(payload);
  assert.equal(claim.mock.calls[0][0].provider, "whatsapp");
  assert.equal(claim.mock.calls[0][0].externalId, "m1");
  assert.equal(claim.mock.calls[1][0].provider, "whatsapp-reply");
  assert.equal(send.mock.calls[0][0], "https://n8n.example.test/webhook");
  assert.equal(send.mock.calls[0][1].headers["x-n8n-secret"], "test-n8n-secret");
  assert.equal(send.mock.calls.length, 2);
});

test("multiple replies start without waiting for earlier generation", async () => {
  setupReplies();
  let finishFirst: (value: { text: string }) => void = () => {};
  generate.mockImplementationOnce(() => new Promise((resolve) => {
    finishFirst = resolve;
  }));
  const payload = delivery([
    { id: "m1", from: "15550001", type: "text", text: { body: "Hi" } },
    { id: "m2", from: "15550002", type: "text", text: { body: "Hello" } },
  ]);
  await handleWhatsAppWebhook(signedRequest(payload));
  const work = afterCallback.mock.calls[0][0]();
  await vi.waitFor(() => assert.equal(generate.mock.calls.length, 2));
  finishFirst({ text: "Hello" });
  await work;
});

test("WhatsApp is available only when outbound configuration is present", () => {
  const env = {
    WHATSAPP_ACCESS_TOKEN: "test-token",
    WHATSAPP_PHONE_NUMBER_ID: "123",
    WHATSAPP_APP_SECRET: "test-secret",
    WHATSAPP_VERIFY_TOKEN: "test-verify",
  };
  for (const key of Object.keys(env) as (keyof typeof env)[]) {
    const configured = isWhatsAppConfigured({ ...env, [key]: "" });
    assert.equal(getIntegrationProviders(configured).find((p) => p.id === "whatsapp")?.status, "coming_soon");
  }
  assert.equal(getIntegrationProviders(isWhatsAppConfigured(env)).find((p) => p.id === "whatsapp")?.status, "available");
});
