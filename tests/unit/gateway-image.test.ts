import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";

const { context, reserve, finish, generate, put } = vi.hoisted(() => ({
  context: vi.fn(),
  reserve: vi.fn(),
  finish: vi.fn(),
  generate: vi.fn(),
  put: vi.fn(),
}));
vi.mock("@/lib/auth/workspace", () => ({ getWorkspaceContext: context }));
vi.mock("@/lib/db/queries", () => ({
  reserveGatewayImage: reserve,
  finishMediaJob: finish,
  createMediaJob: vi.fn(),
  getMediaJob: vi.fn(),
}));
vi.mock("ai", () => ({ generateImage: generate }));
vi.mock("@ai-sdk/gateway", () => ({
  gateway: { imageModel: (id: string) => id },
}));
vi.mock("@vercel/blob", () => ({ put }));

import { POST } from "@/app/api/media-engine/route";

const req = (actionType = "IMAGE") =>
  new Request("https://example.test/api/media-engine", {
    method: "POST",
    body: JSON.stringify({ actionType, prompt: "A future city" }),
  });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("MEDIA_ENGINE_PROVIDER", "ai-gateway");
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "test-only-placeholder");
  context.mockResolvedValue({
    user: { type: "regular", id: "test-user" },
    role: "owner",
    organizationId: "test-workspace",
  });
  reserve.mockResolvedValue({ id: "test-job" });
  finish.mockResolvedValue({ id: "test-job" });
  generate.mockResolvedValue({
    images: [
      { mediaType: "image/png", uint8Array: new Uint8Array([137, 80, 78, 71]) },
    ],
  });
  put.mockResolvedValue({ url: "https://assets.example.test/image.png" });
});
afterEach(() => vi.unstubAllEnvs());
test("persists real provider bytes before returning success", async () => {
  const response = await POST(req());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "succeeded");
  assert.equal(put.mock.calls[0]?.[1].length, 4);
  assert.equal(
    finish.mock.calls[0]?.[0].assetUrl,
    "https://assets.example.test/image.png"
  );
  assert.equal(generate.mock.calls[0]?.[0].maxRetries, 0);
});
test("members, unsupported media, missing storage and daily cap never call provider", async () => {
  context.mockResolvedValueOnce({ user: { type: "regular" }, role: "member" });
  assert.equal((await POST(req())).status, 403);
  assert.equal((await POST(req("VIDEO"))).status, 422);
  assert.equal((await POST(req("MAP_3D"))).status, 422);
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
  assert.equal((await POST(req())).status, 503);
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "test-only-placeholder");
  reserve.mockResolvedValueOnce(null);
  assert.equal((await POST(req())).status, 429);
  assert.equal(generate.mock.calls.length, 0);
});
test("provider failure, missing image or storage failure never report success", async () => {
  generate.mockRejectedValueOnce(new Error("private error"));
  assert.equal((await POST(req())).status, 502);
  generate.mockResolvedValueOnce({ images: [] });
  assert.equal((await POST(req())).status, 502);
  put.mockRejectedValueOnce(new Error("storage failure"));
  assert.equal((await POST(req())).status, 502);
  assert.ok(finish.mock.calls.every(([input]) => input.status === "failed"));
});
test("cartoon uses an actual image model and does not claim a 3D scene", async () => {
  assert.equal((await POST(req("CARTOON"))).status, 200);
  assert.match(generate.mock.calls[0]?.[0].prompt, /^Cartoon illustration/);
});
