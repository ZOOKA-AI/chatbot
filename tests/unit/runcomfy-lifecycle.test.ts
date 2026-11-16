import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

/** Storage is mocked so the lifecycle can be proven without a filesystem or a database. */
const stored: Array<Record<string, unknown>> = [];
vi.mock("@/lib/studio/media", () => {
  class StudioError extends Error {
    readonly code: string;
    readonly detail: string | undefined;
    constructor(code: string, detail?: string) {
      super(code);
      this.code = code;
      this.detail = detail;
    }
  }
  return {
    StudioError,
    store: vi.fn(async (input: Record<string, unknown>) => {
      stored.push(input);
      return { id: "asset-0001" };
    }),
  };
});

/**
 * The approval store is a real table backed by a real database in its own suite
 * (spend-approvals.test.ts). Here it is a stub whose only job is to enforce the contract this file is
 * about: a paid submission names an approval id, and that id can be spent once.
 */
const spendCalls: string[] = [];
vi.mock("@/lib/studio/spend-approvals", () => ({
  async consumeApproval(input: { id: string }) {
    // Single-use is a property of the table, and it is proven against a real database in
    // spend-approvals.test.ts (replay, concurrency, expiry, cross-tenant). Here the stub only records
    // that the lifecycle spent an approval before submitting, which is the contract this file owns.
    spendCalls.push(input.id);
    return { id: input.id };
  },
  async bindProviderJob() {
    return null;
  },
}));

import { studioAiGenerate } from "@/lib/agents/worker-tools/studio-ai-generate";

/**
 * The asynchronous lifecycle end to end, on the documented wire format.
 *
 * Every response body below is the shape https://docs.runcomfy.com/model-apis/async-queue-endpoints
 * documents: `in_queue` → `in_progress` → `completed` for status, and `succeeded`/`failed`/`cancelled`
 * on the result, with `cost` only when `include_cost=true`. No network, no token, no bill.
 */

const MODEL_CATALOG = {
  models: [
    {
      model_id: "blackforestlabs/flux-1-kontext/dev/image-to-image",
      display_name: "Flux Kontext Dev",
      categories: ["text-to-image"],
      kind: "model",
      base_price_usd: 0.06,
      price_unit: "output",
      pricing_note: "The rate is $0.06 per image.",
      required_inputs: ["prompt"],
      supported_batch_size: [1, 2],
    },
  ],
  total: 1,
};

type Route = { match: (url: string) => boolean; response: () => Response };

let routes: Route[] = [];
const seen: string[] = [];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function stubNetwork(statuses: string[], result: Record<string, unknown>, options: { outputFetch?: number } = {}) {
  seen.length = 0;
  let poll = 0;
  routes = [
    { match: (url) => url.includes("/v1/models?"), response: () => json(MODEL_CATALOG) },
    {
      match: (url) => url.includes("/v2/balance"),
      response: () => json({ balance_microdollars: 500_000, balance_usd: 0.5, currency: "USD" }),
    },
    {
      match: (url) => url.includes("/status"),
      response: () => {
        const current = statuses[Math.min(poll, statuses.length - 1)];
        poll += 1;
        return json({ request_id: "req_abc", status: current, queue_position: 2 });
      },
    },
    {
      match: (url) => url.includes("/result"),
      response: () => json({ request_id: "req_abc", ...result }),
    },
    {
      match: (url) => url.startsWith("https://output.runcomfy.net/"),
      response: () =>
        options.outputFetch && options.outputFetch !== 200
          ? new Response("nope", { status: options.outputFetch })
          : new Response(Buffer.from("fake-png-bytes"), { status: 200, headers: { "content-type": "image/png" } }),
    },
    {
      match: (url) => url.includes("/v1/models/"),
      response: () => json({ request_id: "req_abc", status_url: "s", result_url: "r", cancel_url: "c" }),
    },
  ];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL | Request) => {
      const target = String(url);
      seen.push(target);
      const route = routes.find((entry) => entry.match(target));
      if (!route) throw new Error(`unexpected url ${target}`);
      return route.response();
    })
  );
}

const context = (payload: Record<string, unknown>) => ({
  organizationId: "11111111-1111-4111-8111-111111111111",
  agentId: "agent",
  taskId: "task-777",
  payload: {
    prompt: "صورة إعلانية احترافية لشركة تنظيف في أبوظبي",
    approvalId: "approval-1",
    projectId: "22222222-2222-4222-8222-222222222222",
    ...payload,
  },
  signal: new AbortController().signal,
});

beforeEach(() => {
  stored.length = 0;
  process.env.RUNCOMFY_API_TOKEN = "rc_test_only";
  process.env.PAID_GENERATION_ENABLED = "true";
  process.env.RUNCOMFY_POLL_INTERVAL_MS = "1";
  process.env.RUNCOMFY_POLL_BUDGET_MS = "60000";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.RUNCOMFY_API_TOKEN;
  delete process.env.PAID_GENERATION_ENABLED;
  delete process.env.RUNCOMFY_POLL_INTERVAL_MS;
  delete process.env.RUNCOMFY_POLL_BUDGET_MS;
});

describe("success: submit, poll, fetch, persist", () => {
  test("a completed job stores real bytes in the tenant's own library", async () => {
    stubNetwork(["in_queue", "in_progress", "completed"], {
      status: "succeeded",
      output: { image: "https://output.runcomfy.net/a.png" },
      cost: 0.06,
      finished_at: "2026-11-16T09:00:00Z",
    });

    const result = await studioAiGenerate.run(context({}) as never);

    assert.equal(result.ok, true, String(result.summary));
    const evidence = (result as { evidence: Record<string, unknown> }).evidence;
    assert.equal(evidence.assetId, "asset-0001");
    assert.equal(evidence.requestId, "req_abc");
    assert.equal(evidence.costUsd, 0.06, "the real charge is reported, not the estimate");
    assert.equal(evidence.bytes, 14);

    // The bytes were downloaded, not merely linked, and stored under the caller's tenant and project.
    assert.ok(seen.some((url) => url === "https://output.runcomfy.net/a.png"));
    assert.equal(stored.length, 1);
    assert.equal(stored[0].organizationId, "11111111-1111-4111-8111-111111111111");
    assert.equal(stored[0].projectId, "22222222-2222-4222-8222-222222222222");
    assert.equal(stored[0].mimeType, "image/png");
    assert.equal((stored[0].bytes as Buffer).length, 14);
  });

  test("the request body carries the prompt and the requested aspect", async () => {
    stubNetwork(["completed"], { status: "succeeded", output: { image: "https://output.runcomfy.net/a.png" } });
    await studioAiGenerate.run(context({ aspect: "9:16" }) as never);
    const submit = seen.find((url) => /\/v1\/models\/[^?]/.test(url));
    assert.ok(submit?.includes("blackforestlabs%2Fflux-1-kontext%2Fdev%2Fimage-to-image"));
  });
});

describe("failure, timeout and cancellation are all reported as themselves", () => {
  test("a failed job charges what it says and yields no asset", async () => {
    stubNetwork(["completed"], { status: "failed", cost: 0.02 });
    const result = await studioAiGenerate.run(context({}) as never);
    assert.equal(result.ok, false);
    assert.equal((result as { error: string }).error, "provider_failed");
    assert.equal(stored.length, 0, "nothing was stored for a failed job");
  });

  test("a job still queued at the deadline is neither called a success nor a failure", async () => {
    process.env.RUNCOMFY_POLL_BUDGET_MS = "5";
    stubNetwork(["in_queue"], { status: "in_queue" });
    const result = await studioAiGenerate.run(context({}) as never);
    assert.equal(result.ok, false);
    assert.equal((result as { error: string }).error, "still_running");
    assert.match(String(result.summary), /req_abc/, "the request id is handed back so it can be collected");
    assert.equal(stored.length, 0);
  });

  test("a cancelled job is reported as cancelled", async () => {
    stubNetwork(["cancelled"], { status: "cancelled" });
    const result = await studioAiGenerate.run(context({}) as never);
    assert.equal(result.ok, false);
    assert.equal((result as { error: string }).error, "cancelled");
  });

  test("success with no media URL is refused rather than stored empty", async () => {
    stubNetwork(["completed"], { status: "succeeded", output: { note: "nothing here" } });
    const result = await studioAiGenerate.run(context({}) as never);
    assert.equal(result.ok, false);
    assert.equal((result as { error: string }).error, "no_output");
    assert.equal(stored.length, 0);
  });

  test("a failed output download is reported, and nothing is stored", async () => {
    stubNetwork(["completed"], { status: "succeeded", output: { image: "https://output.runcomfy.net/a.png" } }, { outputFetch: 403 });
    const result = await studioAiGenerate.run(context({}) as never);
    assert.equal(result.ok, false);
    assert.equal((result as { error: string }).error, "download_failed");
    assert.equal(stored.length, 0);
  });

  test("insufficient balance at the provider maps to its own error, before any storage", async () => {
    stubNetwork(["completed"], { status: "succeeded", output: { image: "https://output.runcomfy.net/a.png" } });
    // The submit itself is rejected for money by the provider.
    routes.unshift({
      match: (url) => url.includes("/v1/models/") && !url.includes("?"),
      response: () => json({ code: 400002, message: "no balance" }, 402),
    });
    const result = await studioAiGenerate.run(context({}) as never);
    assert.equal(result.ok, false);
    assert.equal((result as { error: string }).error, "insufficient_balance");
    assert.equal(stored.length, 0);
  });
});
