import assert from "node:assert/strict";
import { describe, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { assessOutbound, guardedFetch, isMetadataAddress, isPrivateAddress } from "@/lib/studio/outbound-guard";

/**
 * The SSRF surface of a self-hosted provider, tested as an attacker would approach it.
 *
 * The audit's finding: only the configured endpoint was ever considered, so a redirect or a returned
 * output URL could point the second request anywhere inside the network.
 */

const publicResolve = async () => ["93.184.216.34"];
const metadataResolve = async () => ["169.254.169.254"];

describe("address classification", () => {
  test("cloud metadata is named, on every provider that has one", () => {
    for (const address of ["169.254.169.254", "169.254.170.2", "100.100.100.200", "fd00:ec2::254"]) {
      assert.equal(isMetadataAddress(address), true, address);
    }
    assert.equal(isMetadataAddress("93.184.216.34"), false);
  });

  test("private and loopback ranges are recognised", () => {
    for (const address of ["10.0.0.5", "127.0.0.1", "172.16.4.2", "192.168.1.10", "::1", "fd12::1"]) {
      assert.equal(isPrivateAddress(address), true, address);
    }
    assert.equal(isPrivateAddress("93.184.216.34"), false);
  });
});

describe("assessing an endpoint", () => {
  test("a public endpoint is allowed", async () => {
    const verdict = await assessOutbound("https://gpu.example.com:8188/system_stats", {
      env: {},
      resolve: publicResolve,
    });
    assert.equal(verdict.ok, true);
  });

  test("the metadata service is refused even with the private-network flag on", async () => {
    const verdict = await assessOutbound("http://169.254.169.254/latest/meta-data/", {
      env: { COMFYUI_ALLOW_PRIVATE_NETWORK: "1" },
      resolve: metadataResolve,
    });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.reason, "metadata_endpoint");
  });

  test("a hostname that resolves to the metadata service is refused", async () => {
    const verdict = await assessOutbound("https://innocent.example.com/", {
      env: { COMFYUI_ALLOW_PRIVATE_NETWORK: "1" },
      resolve: metadataResolve,
    });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.reason, "metadata_endpoint");
  });

  test("a LAN worker is refused by default", async () => {
    const verdict = await assessOutbound("http://192.168.1.50:8188/", { env: {}, resolve: publicResolve });
    assert.equal(verdict.ok, false);
  });

  test("a LAN worker is allowed only with the explicit acknowledgement", async () => {
    const allowed = await assessOutbound("http://192.168.1.50:8188/", {
      env: { COMFYUI_ALLOW_PRIVATE_NETWORK: "1" },
      resolve: publicResolve,
    });
    assert.equal(allowed.ok, true);

    const inProduction = await assessOutbound("http://192.168.1.50:8188/", {
      env: { COMFYUI_ALLOW_PRIVATE_NETWORK: "1", VERCEL_ENV: "production" },
      resolve: publicResolve,
    });
    assert.equal(inProduction.ok, false);
  });

  test("a file URL is refused", async () => {
    const verdict = await assessOutbound("file:///etc/passwd", { env: {}, resolve: publicResolve });
    assert.equal(verdict.ok, false);
  });
});

describe("fetching with redirects", () => {
  test("a redirect to the metadata service is refused before it is requested", async () => {
    const requested: string[] = [];
    const fetchImpl = (async (url: string) => {
      requested.push(url);
      if (url.includes("/prompt")) {
        return new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" } });
      }
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;

    await assert.rejects(
      () => guardedFetch("https://gpu.example.com/prompt", {}, { env: {}, fetchImpl, resolve: publicResolve }),
      /outbound_blocked:metadata_endpoint/
    );
    // The first hop happened; the redirect target was never contacted.
    assert.deepEqual(requested, ["https://gpu.example.com/prompt"]);
  });

  test("a redirect to another public host is followed, with a GET", async () => {
    const seen: Array<{ url: string; method: string }> = [];
    const fetchImpl = (async (url: string, init: RequestInit = {}) => {
      seen.push({ url, method: String(init.method ?? "GET") });
      if (url.endsWith("/prompt")) {
        return new Response(null, { status: 303, headers: { location: "https://other.example.com/result" } });
      }
      return new Response("done", { status: 200 });
    }) as unknown as typeof fetch;

    const response = await guardedFetch(
      "https://gpu.example.com/prompt",
      { method: "POST", body: "{}" },
      { env: {}, fetchImpl, resolve: publicResolve }
    );
    assert.equal(response.status, 200);
    assert.equal(seen.length, 2);
    assert.equal(seen[1].method, "GET");
  });

  test("an endless redirect loop stops instead of running forever", async () => {
    let hops = 0;
    const fetchImpl = (async () => {
      hops += 1;
      return new Response(null, { status: 307, headers: { location: "https://gpu.example.com/again" } });
    }) as unknown as typeof fetch;

    await assert.rejects(
      () => guardedFetch("https://gpu.example.com/start", {}, { env: {}, fetchImpl, resolve: publicResolve }),
      /too_many_redirects/
    );
    assert.ok(hops <= 4);
  });
});
