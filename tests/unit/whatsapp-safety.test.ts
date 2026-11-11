import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { afterEach, test, vi } from "vitest";

const { afterCallback, claim } = vi.hoisted(() => ({
  afterCallback: vi.fn(),
  claim: vi.fn(),
}));
vi.mock("next/server", async () => ({
  ...(await vi.importActual<typeof import("next/server")>("next/server")),
  after: afterCallback,
}));
vi.mock("@/lib/webhooks/events", () => ({ claimWebhookEvent: claim }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import {
  handleWhatsAppWebhook,
  verifyWhatsAppChallenge,
} from "@/lib/webhooks/whatsapp";

afterEach(() => {
  vi.unstubAllEnvs();
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
