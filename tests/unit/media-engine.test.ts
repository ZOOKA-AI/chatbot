import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const { context, getToken, getJob } = vi.hoisted(() => ({
  context: vi.fn(),
  getToken: vi.fn(),
  getJob: vi.fn(),
}));
vi.mock("@/lib/auth/workspace", () => ({ getWorkspaceContext: context }));
vi.mock("next-auth/jwt", () => ({ getToken }));
vi.mock("@/lib/db/queries", () => ({
  createMediaJob: vi.fn(),
  finishMediaJob: vi.fn(),
  getMediaJob: getJob,
}));

import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/media-engine/route";
import { createMediaJob, getMediaJob } from "@/lib/db/queries";
import { proxy } from "@/proxy";

beforeEach(() => {
  context.mockReset();
  getToken.mockReset();
  vi.stubEnv("MEDIA_ENGINE_WEBHOOK_URL", "");
  vi.stubEnv("MEDIA_ENGINE_WEBHOOK_SECRET", "");
  context.mockResolvedValue({
    user: { id: "test-user", type: "regular" },
    organizationId: "test-workspace",
  });
});
function request(body: unknown) {
  return new Request("https://example.test/api/media-engine", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

test("anonymous and guest users receive JSON 401", async () => {
  for (const value of [null, { user: { type: "guest" } }]) {
    context.mockResolvedValueOnce(value);
    const response = await POST(
      request({ actionType: "IMAGE", prompt: "city" })
    );
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error, "Unauthorized");
  }
});
test("proxy delegates this exact API route without redirecting to login", async () => {
  const response = await proxy(
    new NextRequest("https://example.test/api/media-engine")
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("location"), null);
  assert.equal(getToken.mock.calls.length, 0);
  const callback = await proxy(
    new NextRequest("https://example.test/api/media-engine/callback")
  );
  assert.equal(callback.headers.get("location"), null);
});
test("invalid JSON, primitive bodies, blank prompts, unsupported types and extra fields return 400", async () => {
  const malformed = new Request("https://example.test/api/media-engine", {
    method: "POST",
    body: "{",
  });
  assert.equal((await POST(malformed)).status, 400);
  for (const body of [
    null,
    [],
    "text",
    {},
    { actionType: "OTHER", prompt: "city" },
    { actionType: "IMAGE", prompt: "  " },
    { actionType: "IMAGE", prompt: "x".repeat(4001) },
    { actionType: "IMAGE", prompt: "city", resolution: "4K" },
  ]) {
    assert.equal((await POST(request(body))).status, 400);
  }
});
test("every supported type returns unavailable with no fake asset even if a key is present", async () => {
  vi.stubEnv("AI_GENERATION_PROVIDER_KEY", "test-not-a-real-key");
  try {
    for (const actionType of ["IMAGE", "VIDEO", "MAP_3D", "CARTOON"]) {
      const response = await POST(request({ actionType, prompt: " city " }));
      assert.equal(response.status, 503);
      assert.equal(response.status, 503);
      const body = await response.json();
      assert.equal(body.configured, false);
      assert.equal(body.assetUrl, undefined);
    }
  } finally {
    vi.unstubAllEnvs();
  }
});
test("internal exceptions do not leak details", async () => {
  context.mockRejectedValueOnce(new Error("private database detail"));
  const response = await POST(request({ actionType: "IMAGE", prompt: "city" }));
  assert.equal(response.status, 500);
  assert.equal(
    (await response.text()).includes("private database detail"),
    false
  );
});

test("callback stays protected by signature validation when bypassing login middleware", async () => {
  vi.stubEnv("MEDIA_ENGINE_WEBHOOK_SECRET", "test-signature-secret");
  try {
    const { POST: callback } = await import(
      "@/app/api/media-engine/callback/route"
    );
    const response = await callback(request({ status: "succeeded" }));
    assert.equal(response.status, 401);
  } finally {
    vi.unstubAllEnvs();
  }
});

test("configured dispatch creates a workspace job and signs the outbound payload", async () => {
  vi.stubEnv("MEDIA_ENGINE_WEBHOOK_URL", "https://provider.example.test/jobs");
  vi.stubEnv("MEDIA_ENGINE_WEBHOOK_SECRET", "test-dispatch-secret");
  const jobId = "11111111-1111-4111-8111-111111111111";
  vi.mocked(createMediaJob).mockResolvedValueOnce({
    id: jobId,
    actionType: "IMAGE",
    prompt: "city",
  } as Awaited<ReturnType<typeof createMediaJob>>);
  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(null, { status: 202 }));
  try {
    const response = await POST(
      request({ actionType: "IMAGE", prompt: "city" })
    );
    assert.equal(response.status, 202);
    assert.equal((await response.json()).jobId, jobId);
    assert.deepEqual(vi.mocked(createMediaJob).mock.calls.at(-1)?.[0], {
      organizationId: "test-workspace",
      actionType: "IMAGE",
      prompt: "city",
    });
    const options = fetchMock.mock.calls[0]?.[1];
    assert.equal(typeof options?.body, "string");
    const { createHmac } = await import("node:crypto");
    const expected = createHmac("sha256", "test-dispatch-secret")
      .update(String(options?.body))
      .digest("hex");
    assert.equal(
      new Headers(options?.headers).get("x-zooka-signature"),
      expected
    );
  } finally {
    fetchMock.mockRestore();
    vi.unstubAllEnvs();
  }
});

test("job reads include the authenticated workspace and missing jobs return 404", async () => {
  getJob.mockResolvedValueOnce(null);
  const id = "11111111-1111-4111-8111-111111111111";
  const response = await GET(
    new Request(`https://example.test/api/media-engine?jobId=${id}`)
  );
  assert.equal(response.status, 404);
  assert.deepEqual(vi.mocked(getMediaJob).mock.calls.at(-1), [
    id,
    "test-workspace",
  ]);
});
