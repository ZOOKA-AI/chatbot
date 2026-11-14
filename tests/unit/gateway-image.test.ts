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
  put.mockResolvedValue({
    pathname: "test-workspace/generated-media/test-job-random.png",
  });
});
afterEach(() => vi.unstubAllEnvs());
test("persists real provider bytes before returning success", async () => {
  const response = await POST(req());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "succeeded");
  assert.equal(put.mock.calls[0]?.[1].length, 4);
  assert.equal(
    finish.mock.calls[0]?.[0].assetUrl,
    "/api/files/test-workspace/generated-media/test-job-random.png"
  );
  assert.equal(
    put.mock.calls[0]?.[0],
    "test-workspace/generated-media/test-job.png"
  );
  assert.equal(put.mock.calls[0]?.[2].access, "private");
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

test("provider and storage failures have safe stage/reference without credentials or prompt", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  try {
    generate.mockRejectedValueOnce(
      Object.assign(new Error("PRIVATE_PROVIDER_TOKEN and prompt"), {
        statusCode: 403,
        responseBody: "PRIVATE_PROVIDER_TOKEN",
      })
    );
    const response = await POST(req());
    const body = await response.json();
    assert.equal(body.code, "IMAGE_PROVIDER_FAILED");
    assert.match(body.reference, /^[a-f0-9-]{36}$/);
    assert.equal(log.mock.calls[0]?.[1].upstreamStatus, 403);
    assert.equal(
      JSON.stringify(body).includes("PRIVATE_PROVIDER_TOKEN"),
      false
    );
    assert.equal(
      JSON.stringify(log.mock.calls).includes("PRIVATE_PROVIDER_TOKEN"),
      false
    );
    put.mockRejectedValueOnce(
      Object.assign(new Error("PRIVATE_STORAGE_TOKEN"), { statusCode: 401 })
    );
    const storage = await POST(req());
    assert.equal((await storage.json()).code, "IMAGE_STORAGE_FAILED");
    assert.equal(
      JSON.stringify(log.mock.calls).includes("PRIVATE_STORAGE_TOKEN"),
      false
    );
  } finally {
    log.mockRestore();
  }
});

test("database failure while recording a failed job keeps the original error reference", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  try {
    generate.mockRejectedValueOnce(new Error("provider failed"));
    finish.mockRejectedValueOnce(new Error("private database detail"));
    const response = await POST(req());
    const body = await response.json();
    assert.equal(response.status, 502);
    assert.equal(body.code, "IMAGE_PROVIDER_FAILED");
    assert.equal(
      log.mock.calls[0]?.[1].reference,
      log.mock.calls[1]?.[1].reference
    );
    assert.equal(
      JSON.stringify(log.mock.calls).includes("private database detail"),
      false
    );
  } finally {
    log.mockRestore();
  }
});

test("nested SDK errors expose only allowlisted category and numeric status", async () => {
  const { classifyImageError } = await import("@/lib/media/gateway-image");
  const nested = {
    name: "AI_RetryError",
    lastError: {
      name: "AI_APICallError",
      statusCode: 403,
      message: "private",
      responseBody: "secret",
    },
  };
  assert.deepEqual(classifyImageError(nested), {
    category: "http",
    status: 403,
  });
  const circular: { name: string; cause?: unknown } = {
    name: "Unknown private text",
  };
  circular.cause = circular;
  assert.deepEqual(classifyImageError(circular), {
    category: "unknown",
    status: null,
  });
  assert.deepEqual(classifyImageError({ name: "AI_NoImageGeneratedError" }), {
    category: "empty_output",
    status: null,
  });
  assert.deepEqual(
    classifyImageError({ name: "TypeError", cause: { name: "TimeoutError" } }),
    { category: "timeout", status: null }
  );
});

test("advanced ratio/reference reach the provider only after authorization and invalid bytes never reserve budget",async()=>{
 const reference="data:image/png;base64,"+Buffer.from([137,80,78,71,13,10,26,10]).toString("base64");
 const input=(imageOptions:unknown)=>new Request("https://example.test/api/media-engine",{method:"POST",body:JSON.stringify({actionType:"IMAGE",prompt:"Product",imageOptions})});
 const response=await POST(input({ratio:"9:16",style:"minimal",reference}));assert.equal(response.status,200);assert.equal(generate.mock.calls[0][0].aspectRatio,"9:16");assert.equal(typeof generate.mock.calls[0][0].prompt,"object");assert.equal(generate.mock.calls[0][0].prompt.images[0].length,8);
 const before=reserve.mock.calls.length;assert.equal((await POST(input({reference:"data:image/png;base64,YmFk"}))).status,400);assert.equal(reserve.mock.calls.length,before);
});
