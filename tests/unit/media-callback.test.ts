import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, test, vi } from "vitest";

const { finish } = vi.hoisted(() => ({ finish: vi.fn() }));
vi.mock("@/lib/db/queries", () => ({ finishMediaJob: finish }));
vi.mock("next-auth/jwt", () => ({ getToken: vi.fn() }));

import { POST } from "@/app/api/media-engine/callback/route";
import {
  isAllowedMediaAsset,
  mediaSignatureMatches,
} from "@/lib/media/callback";

const secret = "unit-test-signing-secret-not-a-real-credential";
const id = "11111111-1111-4111-8111-111111111111";
function signed(
  body: string,
  signature = createHmac("sha256", secret).update(body).digest("hex")
) {
  return new Request("https://example.test/api/media-engine/callback", {
    method: "POST",
    headers: { "x-zooka-signature": signature },
    body,
  });
}
beforeEach(() => {
  finish.mockReset();
  finish.mockResolvedValue({ id });
  vi.stubEnv("MEDIA_ENGINE_WEBHOOK_SECRET", secret);
  vi.stubEnv("MEDIA_ENGINE_ASSET_HOSTS", "assets.example.test");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

test("signature contract uses exact UTF-8 bytes and rejects tampering or malformed hex", () => {
  const body = '{ "message": "مدينة مستقبلية" }\n';
  const signature = createHmac("sha256", secret).update(body).digest("hex");
  assert.equal(
    mediaSignatureMatches(Buffer.from(body), signature, secret),
    true
  );
  assert.equal(
    mediaSignatureMatches(Buffer.from(body.trim()), signature, secret),
    false
  );
  for (const value of [
    null,
    "",
    "a".repeat(64),
    "z".repeat(64),
    `sha256=${signature}`,
    signature.toUpperCase(),
  ]) {
    assert.equal(
      mediaSignatureMatches(Buffer.from(body), value, secret),
      false
    );
  }
});
test("missing configuration, unsigned requests, malformed JSON and oversized bodies fail without writes", async () => {
  vi.stubEnv("MEDIA_ENGINE_WEBHOOK_SECRET", "");
  assert.equal((await POST(signed("{}"))).status, 503);
  vi.stubEnv("MEDIA_ENGINE_WEBHOOK_SECRET", secret);
  assert.equal((await POST(signed("{}", "bad"))).status, 401);
  assert.equal((await POST(signed("{"))).status, 400);
  assert.equal((await POST(signed("x".repeat(16_385)))).status, 413);
  assert.equal(finish.mock.calls.length, 0);
});
test("success requires an HTTPS asset from an exact approved host", async () => {
  for (const assetUrl of [
    undefined,
    "http://assets.example.test/a",
    "https://evil.test/a",
    "https://user:password@assets.example.test/a",
    "https://assets.example.test:8443/a",
    "https://assets.example.test/a#fragment",
  ]) {
    const response = await POST(
      signed(JSON.stringify({ jobId: id, status: "succeeded", assetUrl }))
    );
    assert.equal(response.status, 400);
  }
  assert.equal(isAllowedMediaAsset("https://127.0.0.1/a", "127.0.0.1"), false);
  assert.equal(isAllowedMediaAsset("https://[::1]/a", "[::1]"), false);
  assert.equal(isAllowedMediaAsset("https://localhost/a", "localhost"), false);
  assert.equal(isAllowedMediaAsset("https://assets.example.test/a", ""), false);
  assert.equal(finish.mock.calls.length, 0);
});
test("running is persisted; terminal duplicates are acknowledged without pretending to update", async () => {
  assert.equal(
    (await POST(signed(JSON.stringify({ jobId: id, status: "running" }))))
      .status,
    200
  );
  assert.equal(finish.mock.calls[0]?.[0].status, "running");
  const payload = JSON.stringify({
    jobId: id,
    status: "succeeded",
    assetUrl: "https://assets.example.test/asset.png",
  });
  const first = await POST(signed(payload));
  assert.deepEqual(await first.json(), { ok: true, ignored: false });
  finish.mockResolvedValueOnce(null);
  const replay = await POST(signed(payload));
  assert.deepEqual(await replay.json(), { ok: true, ignored: true });
});
test("failed requires a bounded error; unknown fields cannot change job ownership", async () => {
  for (const payload of [
    null,
    [],
    { jobId: id, status: "failed" },
    { jobId: id, status: "failed", error: "x".repeat(501) },
    { jobId: id, status: "running", organizationId: id },
  ]) {
    assert.equal((await POST(signed(JSON.stringify(payload)))).status, 400);
  }
  assert.equal(
    (
      await POST(
        signed(
          JSON.stringify({
            jobId: id,
            status: "failed",
            error: "Provider failed",
          })
        )
      )
    ).status,
    200
  );
});
test("storage errors return generic 500 so sender can retry", async () => {
  finish.mockRejectedValueOnce(new Error("private database details"));
  const response = await POST(
    signed(JSON.stringify({ jobId: id, status: "running" }))
  );
  assert.equal(response.status, 500);
  assert.equal((await response.text()).includes("private database"), false);
});

test("proxy lets the signed callback reach its own authorization without a login redirect", async () => {
  const { NextRequest } = await import("next/server");
  const { proxy } = await import("@/proxy");
  const response = await proxy(
    new NextRequest("https://example.test/api/media-engine/callback")
  );
  assert.equal(response.headers.get("location"), null);
  assert.equal(response.status, 200);
});
