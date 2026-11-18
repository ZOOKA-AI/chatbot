import { describe, expect, test } from "vitest";

import { loadIntegrationStatus } from "@/lib/integrations/status-fetch";

/**
 * A status card may not wait forever.
 *
 * The reported defect was three cards stuck on "Checking…" while the endpoint answered 200 elsewhere.
 * The component had an error branch but no way to reach it, because a promise that never settles is
 * not an error. These cases pin the three outcomes that must be distinguishable: a real answer, a
 * refused answer, and an answer that never came.
 */

describe("integration status fetch", () => {
  test("a real answer is returned with its body", async () => {
    const outcome = await loadIntegrationStatus<{ connected: boolean }>("github", {
      fetchImpl: (async () =>
        new Response(JSON.stringify({ connected: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })) as unknown as typeof fetch,
    });
    expect(outcome).toEqual({ ok: true, status: { connected: true } });
  });

  test("an HTTP error is reported as such, not as a stuck loading state", async () => {
    const outcome = await loadIntegrationStatus("vercel", {
      fetchImpl: (async () => new Response("nope", { status: 503 })) as unknown as typeof fetch,
    });
    expect(outcome).toEqual({ ok: false, reason: "http" });
  });

  test("a request that never settles times out instead of spinning forever", async () => {
    // Honours the abort signal, like a real fetch does; without a bound this promise never resolves.
    const hanging = ((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      })) as unknown as typeof fetch;

    const started = Date.now();
    const outcome = await loadIntegrationStatus("x", { fetchImpl: hanging, timeoutMs: 40 });
    expect(outcome).toEqual({ ok: false, reason: "timeout" });
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  test("a network failure and a non-object body are not confused with a timeout", async () => {
    const network = await loadIntegrationStatus("github", {
      fetchImpl: (async () => {
        throw new TypeError("Failed to fetch");
      }) as unknown as typeof fetch,
    });
    expect(network).toEqual({ ok: false, reason: "network" });

    const shape = await loadIntegrationStatus("github", {
      fetchImpl: (async () => new Response("null", { status: 200 })) as unknown as typeof fetch,
    });
    expect(shape).toEqual({ ok: false, reason: "shape" });
  });
});
