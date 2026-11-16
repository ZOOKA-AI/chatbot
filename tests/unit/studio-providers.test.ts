import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { comfyEndpoint, createComfyProvider, localProvider, providerRegistry } from "@/lib/studio/providers";

/**
 * The provider adapter, tested without a GPU.
 *
 * Every branch that matters is decided by configuration and by what an endpoint answers, so a fake
 * fetch is enough to prove the behaviour: it says blocked when it is blocked, it never invents bytes,
 * and it refuses a job that carries no tenant. A real ComfyUI instance would only add latency here.
 */

async function workflowFixture() {
  const directory = await mkdtemp(join(tmpdir(), "comfy-"));
  const path = join(directory, "workflow.json");
  await writeFile(
    path,
    JSON.stringify({
      graph: { "6": { class_type: "CLIPTextEncode", inputs: { text: "" } }, "9": { class_type: "SaveImage", inputs: {} } },
      promptNodeId: "6",
      outputNodeId: "9",
    })
  );
  return path;
}

const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3, 4, 5]);

type Route = (url: string, init?: RequestInit) => Response | Promise<Response>;

function fakeFetch(routes: Route) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    return routes(url, init);
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe("generative is a separate claim from ready", () => {
  test("the local provider is ready and explicitly not generative", () => {
    const registry = providerRegistry({ env: {} });
    const local = registry.find((provider) => provider.id === "local-ffmpeg");
    const comfy = registry.find((provider) => provider.id === "comfyui");
    assert.equal(local?.generative, false, "editing is not generation");
    assert.equal(comfy?.generative, true);
  });

  test("no generative provider means the caller must report a blocker, not pick the editor", () => {
    const registry = providerRegistry({ env: {} });
    const usable = registry.filter((provider) => provider.generative);
    // With no endpoint configured, ComfyUI exists but cannot answer, so nothing may be selected.
    assert.equal(usable.length, 1);
    assert.equal(usable[0].id, "comfyui");
  });
});

describe("the local provider refuses to be sold as generation", () => {
  test("it reports ready for editing and refuses a prompt", async () => {
    const status = await localProvider.status();
    assert.equal(status.ready, true);
    const result = await localProvider.generate({ organizationId: "org", prompt: "قطة", capability: "image" });
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.code, "not_generative");
  });
});

describe("what the adapter says when nothing is configured", () => {
  test("no endpoint is a named blocker, not a crash", async () => {
    const provider = createComfyProvider({ env: {} });
    const status = await provider.status();
    assert.equal(status.ready, false);
    if (status.ready === false) assert.equal(status.blocked, "endpoint_not_configured");
  });

  test("an endpoint without a workflow is its own blocker", async () => {
    const provider = createComfyProvider({
      env: { COMFYUI_ENDPOINT: "http://127.0.0.1:8188", COMFYUI_ALLOW_PRIVATE_NETWORK: "1" },
      fetchImpl: fakeFetch(() => new Response("{}", { status: 200 })).impl,
    });
    const status = await provider.status();
    assert.equal(status.ready, false);
    if (status.ready === false) assert.equal(status.blocked, "workflow_not_configured");
  });

  test("an unreachable endpoint is reported, and the endpoint is never invented", async () => {
    const workflow = await workflowFixture();
    const provider = createComfyProvider({
      env: { COMFYUI_ENDPOINT: "http://127.0.0.1:8188", COMFYUI_ALLOW_PRIVATE_NETWORK: "1", COMFYUI_WORKFLOW_FILE: workflow },
      fetchImpl: fakeFetch(() => {
        throw new TypeError("fetch failed");
      }).impl,
    });
    const status = await provider.status();
    assert.equal(status.ready, false);
    if (status.ready === false) assert.equal(status.blocked, "endpoint_unreachable");
  });

  test("only an http(s) endpoint is accepted, and a trailing slash is normalised", () => {
    assert.equal(comfyEndpoint({ COMFYUI_ENDPOINT: "http://gpu.local:8188/" }), "http://gpu.local:8188");
    assert.equal(comfyEndpoint({ COMFYUI_ENDPOINT: "gpu.local:8188" }), null);
    assert.equal(comfyEndpoint({ COMFYUI_ENDPOINT: "file:///etc/passwd" }), null);
    assert.equal(comfyEndpoint({}), null);
  });
});

describe("a real job against an answering endpoint", () => {
  test("submit, poll, fetch the bytes, and report how long it took", async () => {
    const workflow = await workflowFixture();
    const state = { polls: 0 };
    const { impl, calls } = fakeFetch((url) => {
      if (url.endsWith("/system_stats")) {
        return new Response(JSON.stringify({ devices: [{ name: "cpu" }] }), { status: 200 });
      }
      if (url.endsWith("/prompt")) {
        return new Response(JSON.stringify({ prompt_id: "job-1" }), { status: 200 });
      }
      if (url.includes("/history/job-1")) {
        state.polls += 1;
        // First poll: still working. Second: finished.
        if (state.polls < 2) return new Response(JSON.stringify({}), { status: 200 });
        return new Response(
          JSON.stringify({ "job-1": { status: { status_str: "success" }, outputs: { "9": { images: [{ filename: "out.png", subfolder: "", type: "output" }] } } } }),
          { status: 200 }
        );
      }
      if (url.includes("/view?")) {
        return new Response(new Uint8Array(pngBytes), { status: 200, headers: { "content-type": "image/png" } });
      }
      return new Response("{}", { status: 404 });
    });

    const provider = createComfyProvider({
      env: { COMFYUI_ENDPOINT: "http://127.0.0.1:8188", COMFYUI_ALLOW_PRIVATE_NETWORK: "1", COMFYUI_WORKFLOW_FILE: workflow, COMFYUI_POLL_MS: "1" },
      fetchImpl: impl,
    });

    const result = await provider.generate({ organizationId: "org-alpha", prompt: "لوحة", capability: "image" });
    assert.equal(result.ok, true);
    if (result.ok === true) {
      assert.equal(result.provider, "comfyui");
      assert.equal(result.mimeType, "image/png");
      assert.equal(result.bytes.length, pngBytes.length);
      assert.equal(result.meta.organizationId, "org-alpha");
    }
    // The prompt really reached the graph, and the tenant was recorded with the job.
    const submit = calls.find((call) => call.url.endsWith("/prompt"));
    const body = JSON.parse(String(submit?.init?.body));
    assert.equal(body.prompt["6"].inputs.text, "لوحة");
    assert.equal(body.client_id, "org-alpha");
  });

  test("a job with no tenant is refused before any request is made", async () => {
    const workflow = await workflowFixture();
    const { impl, calls } = fakeFetch(() => new Response("{}", { status: 200 }));
    const provider = createComfyProvider({
      env: { COMFYUI_ENDPOINT: "http://127.0.0.1:8188", COMFYUI_ALLOW_PRIVATE_NETWORK: "1", COMFYUI_WORKFLOW_FILE: workflow },
      fetchImpl: impl,
    });
    const result = await provider.generate({ organizationId: "", prompt: "x", capability: "image" });
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.code, "tenant_required");
    assert.equal(calls.length, 0, "no network call without a tenant");
  });

  test("a workflow that reports an error is a failure, not an empty success", async () => {
    const workflow = await workflowFixture();
    const { impl } = fakeFetch((url) => {
      if (url.endsWith("/system_stats")) return new Response("{}", { status: 200 });
      if (url.endsWith("/prompt")) return new Response(JSON.stringify({ prompt_id: "job-2" }), { status: 200 });
      return new Response(JSON.stringify({ "job-2": { status: { status_str: "error" } } }), { status: 200 });
    });
    const provider = createComfyProvider({
      env: { COMFYUI_ENDPOINT: "http://127.0.0.1:8188", COMFYUI_ALLOW_PRIVATE_NETWORK: "1", COMFYUI_WORKFLOW_FILE: workflow, COMFYUI_POLL_MS: "1" },
      fetchImpl: impl,
    });
    const result = await provider.generate({ organizationId: "org", prompt: "x", capability: "image" });
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.code, "job_failed");
  });

  test("a job that never finishes hits the deadline instead of hanging", async () => {
    const workflow = await workflowFixture();
    const { impl } = fakeFetch((url) => {
      if (url.endsWith("/system_stats")) return new Response("{}", { status: 200 });
      if (url.endsWith("/prompt")) return new Response(JSON.stringify({ prompt_id: "job-3" }), { status: 200 });
      return new Response("{}", { status: 200 });
    });
    const provider = createComfyProvider({
      env: {
        COMFYUI_ENDPOINT: "http://127.0.0.1:8188", COMFYUI_ALLOW_PRIVATE_NETWORK: "1",
        COMFYUI_WORKFLOW_FILE: workflow,
        COMFYUI_POLL_MS: "1",
        COMFYUI_TIMEOUT_MS: "60",
      },
      fetchImpl: impl,
    });
    const result = await provider.generate({ organizationId: "org", prompt: "x", capability: "image" });
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.code, "timeout");
  });

  test("the registry lists the local provider first and the adapter second", () => {
    const ids = providerRegistry({ env: {} }).map((provider) => provider.id);
    assert.deepEqual(ids, ["local-ffmpeg", "comfyui"]);
  });
});
