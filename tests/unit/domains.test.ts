import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";

const { context } = vi.hoisted(() => ({ context: vi.fn() }));
vi.mock("@/lib/auth/workspace", () => ({ getWorkspaceContext: context }));
vi.mock("next-auth/jwt", () => ({ getToken: vi.fn() }));

import { POST } from "@/app/api/domains/route";
import { checkRegistrarDomain, normalizeDomain } from "@/lib/domains/registrar";

beforeEach(() => {
  context.mockReset();
  context.mockResolvedValue({
    user: { type: "regular" },
    organizationId: "test-workspace",
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
const request = (body: unknown) =>
  new Request("https://app.example.test/api/domains", {
    method: "POST",
    body: JSON.stringify(body),
  });

test("domain input never silently removes www, paths, credentials or schemes", () => {
  assert.equal(normalizeDomain(" Example.COM "), "example.com");
  assert.equal(normalizeDomain("www.example.com"), "www.example.com");
  assert.equal(normalizeDomain("مثال.com"), "xn--mgbh0fb.com");
  for (const input of [
    "https://example.com",
    "example.com/path",
    "user@example.com",
    "example.com?x=1",
    "localhost",
    "127.0.0.1",
    "-a.com",
    "a..com",
    "example.com#x",
  ]) {
    assert.equal(normalizeDomain(input), null);
  }
});
test("registrar responses, not RDAP 404s or environment prices, determine availability and quote", async () => {
  vi.stubEnv("DOMAIN_PRICE_USD", "0.01");
  const fetchMock = vi.spyOn(globalThis, "fetch");
  fetchMock.mockResolvedValueOnce(Response.json({ available: true }));
  fetchMock.mockResolvedValueOnce(
    Response.json({
      years: 1,
      purchasePrice: 15.49,
      renewalPrice: 17.99,
      transferPrice: 15.49,
    })
  );
  const result = await checkRegistrarDomain("example.com");
  assert.equal(result.available, true);
  assert.equal(result.quote?.purchasePrice, 15.49);
  assert.equal(
    String(fetchMock.mock.calls[0]?.[0]),
    "https://api.vercel.com/v1/registrar/domains/example.com/availability"
  );
});
test("registered names do not return a made-up purchase price", async () => {
  const mock = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(Response.json({ available: false }));
  const result = await checkRegistrarDomain("example.com");
  assert.equal(result.available, false);
  assert.equal(result.quote, null);
  assert.equal(mock.mock.calls.length, 1);
});
test("failed or malformed registrar lookup never means available", async () => {
  const mock = vi.spyOn(globalThis, "fetch");
  for (const response of [
    new Response(null, { status: 404 }),
    Response.json({ available: "true" }),
    new Response(null, { status: 429 }),
  ]) {
    mock.mockResolvedValueOnce(response);
    await assert.rejects(checkRegistrarDomain("example.com"));
  }
});
test("quote failure keeps availability but cannot invent a price", async () => {
  const mock = vi.spyOn(globalThis, "fetch");
  for (const quote of [
    new Response(null, { status: 503 }),
    Response.json({
      years: 1,
      purchasePrice: "premium",
      renewalPrice: 10,
      transferPrice: 10,
    }),
  ]) {
    mock.mockResolvedValueOnce(Response.json({ available: true }));
    mock.mockResolvedValueOnce(quote);
    const result = await checkRegistrarDomain("example.com");
    assert.equal(result.available, true);
    assert.equal(result.quote, null);
  }
});
test("purchase cannot create a Stripe session even when provider keys are present", async () => {
  vi.stubEnv("OPENPROVIDER_TOKEN", "unit-test-only-value");
  const fetchMock = vi.spyOn(globalThis, "fetch");
  const response = await POST(
    request({ action: "PURCHASE", domainName: "example.com" })
  );
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "DOMAIN_FULFILLMENT_NOT_READY");
  assert.equal(fetchMock.mock.calls.length, 0);
});
test("API rejects guests, invalid JSON and extra fields", async () => {
  context
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ user: { type: "guest" } });
  assert.equal(
    (await POST(request({ action: "CHECK", domainName: "example.com" })))
      .status,
    401
  );
  assert.equal(
    (await POST(request({ action: "CHECK", domainName: "example.com" })))
      .status,
    401
  );
  assert.equal(
    (
      await POST(
        new Request("https://example.test/api/domains", {
          method: "POST",
          body: "{",
        })
      )
    ).status,
    400
  );
  assert.equal(
    (
      await POST(
        request({ action: "CHECK", domainName: "example.com", price: 1 })
      )
    ).status,
    400
  );
});
test("CHECK returns source evidence and never claims the domain was purchased", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    Response.json({ available: false })
  );
  const response = await POST(
    request({ action: "CHECK", domainName: "example.com" })
  );
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.purchased, false);
  assert.equal(body.purchasable, false);
  assert.equal(body.source, "vercel_registrar");
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("domain and project API requests reach route authorization without HTML login redirects", async () => {
  const { NextRequest } = await import("next/server");
  const { proxy } = await import("@/proxy");
  for (const path of ["/api/domains", "/api/projects"]) {
    const response = await proxy(
      new NextRequest(`https://app.example.test${path}`)
    );
    assert.equal(response.headers.get("location"), null);
  }
});
